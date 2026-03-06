// [Input] chrome tabs/downloads/scripting 能力与当前活动 Kimi 标签页。
// [Output] 基于 history-only 工作标签页池的 UI 回退导出结果与本地下载（含 tab ready 兜底）。
// [Pos] 后台导出链路在 API 失败后的稳定并发 UI 回退执行器。
import { bytesToBase64, ExportOrchestrator } from "./export-orchestrator.js";
import { createLogger } from "./logger.js";
import {
  DISCOVER_ALL_HISTORY_ENTRIES_MESSAGE,
  EXTRACT_CURRENT_CHAT_MESSAGE
} from "./message-types.js";
import { ProviderError } from "./provider.js";

const TAB_READY_POLL_INTERVAL_MS = 150;
const TAB_READY_MAX_POLLS = 80;
const RUNNER_MESSAGE_RETRY_INTERVAL_MS = 220;
const RUNNER_MESSAGE_MAX_ATTEMPTS = 3;
const DEFAULT_WORKER_CONCURRENCY = 5;
const HISTORY_DISCOVERY_URL = "https://www.kimi.com/chat/history";

export async function exportViaWorkerTabUI({
  chromeApi = chrome,
  activeTab,
  workerConcurrency = DEFAULT_WORKER_CONCURRENCY,
  logger = createLogger("WorkerTabExport")
} = {}) {
  const provider = createHistoryWorkerTabProvider({
    chromeApi,
    activeTab,
    workerConcurrency,
    logger: logger.child("Driver")
  });

  try {
    const orchestrator = new ExportOrchestrator({
      providers: [provider],
      logger: logger.child("Orchestrator")
    });

    const result = await orchestrator.run((progress) => {
      logger.info("progress", progress);
    });
    const downloadId = await chromeApi.downloads.download({
      url: `data:application/zip;base64,${bytesToBase64(result.bytes)}`,
      filename: result.fileName,
      saveAs: true
    });

    return {
      downloadId,
      stats: result.stats,
      provider: result.provider,
      fileName: result.fileName
    };
  } finally {
    await provider.dispose?.();
  }
}

export function createHistoryWorkerTabProvider({
  chromeApi = chrome,
  activeTab,
  workerConcurrency = DEFAULT_WORKER_CONCURRENCY,
  logger = createLogger("WorkerTabProvider")
} = {}) {
  let historyTabId = null;
  const workerTabIds = [];

  return {
    name: "ui",

    async collectAll(onProgress) {
      const discovery = await discoverHistoryEntries();
      const entries = dedupeEntries(discovery.entries || []);
      const failures = [...(discovery.failures || [])];

      if (!entries.length) {
        throw new ProviderError("ui", "No history entries discovered from /chat/history", failures);
      }

      const { conversations, entryFailures } = await collectConversationsInParallel({
        entries,
        workerConcurrency,
        chromeApi,
        activeTab,
        workerTabIds,
        logger,
        onProgress
      });

      failures.push(...entryFailures);
      if (!conversations.length) {
        throw new ProviderError("ui", "UI provider failed for all conversations", failures);
      }

      return {
        provider: "ui",
        conversations,
        failures
      };
    },

    async dispose() {
      const tabsToClose = [historyTabId, ...workerTabIds].filter(Boolean);
      historyTabId = null;
      workerTabIds.splice(0, workerTabIds.length);

      await Promise.all(
        tabsToClose.map(async (tabId) => {
          try {
            await chromeApi.tabs.remove(tabId);
          } catch (_error) {
            // 清理阶段忽略已关闭标签页，避免覆盖主流程错误。
          }
        })
      );
    }
  };

  async function discoverHistoryEntries() {
    if (!historyTabId) {
      const historyTab = await chromeApi.tabs.create({
        url: HISTORY_DISCOVERY_URL,
        active: false,
        ...(activeTab?.windowId ? { windowId: activeTab.windowId } : {})
      });
      if (!historyTab?.id) {
        throw new Error("History discovery tab creation failed");
      }
      historyTabId = historyTab.id;
    }

    await waitForTabComplete(chromeApi, historyTabId, logger);
    const payload = await sendRunnerMessage(chromeApi, historyTabId, {
      type: DISCOVER_ALL_HISTORY_ENTRIES_MESSAGE
    });
    if (!payload || payload.ok !== true) {
      const reason = payload && typeof payload.error === "string" ? payload.error : "History discovery failed";
      throw new Error(reason);
    }

    logger.info("discovered_entries", {
      history: payload.entries?.length || 0,
      failures: payload.failures?.length || 0
    });

    await chromeApi.tabs.remove(historyTabId);
    historyTabId = null;
    return payload;
  }
}

async function collectConversationsInParallel({
  entries,
  workerConcurrency,
  chromeApi,
  activeTab,
  workerTabIds,
  logger,
  onProgress
}) {
  const conversations = [];
  const entryFailures = [];
  const total = entries.length;
  const workerCount = Math.min(Math.max(workerConcurrency, 1), total);
  let nextIndex = 0;
  let completedCount = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    const firstEntry = takeNextEntry();
    if (!firstEntry) {
      return;
    }

    const workerTab = await chromeApi.tabs.create({
      url: firstEntry.url,
      active: false,
      ...(activeTab?.windowId ? { windowId: activeTab.windowId } : {})
    });
    if (!workerTab?.id) {
      throw new Error("Worker tab creation failed");
    }

    workerTabIds.push(workerTab.id);
    await processEntry(workerTab.id, firstEntry);

    while (true) {
      const entry = takeNextEntry();
      if (!entry) {
        return;
      }
      await processEntry(workerTab.id, entry);
    }
  });

  await Promise.all(workers);
  return {
    conversations: conversations.sort((left, right) => left.index - right.index).map((item) => item.conversation),
    entryFailures
  };

  function takeNextEntry() {
    if (nextIndex >= entries.length) {
      return null;
    }

    const queueIndex = nextIndex;
    nextIndex += 1;
    return { ...entries[queueIndex], queueIndex };
  }

  async function processEntry(tabId, entry) {
    try {
      await chromeApi.tabs.update(tabId, { url: entry.url, active: false });
      await waitForTabComplete(chromeApi, tabId, logger);

      const payload = await sendRunnerMessage(chromeApi, tabId, {
        type: EXTRACT_CURRENT_CHAT_MESSAGE,
        entry,
        fallbackTitle: entry.title
      });
      if (!payload || payload.ok !== true || !payload.conversation?.messages?.length) {
        const reason =
          payload && typeof payload.error === "string" ? payload.error : "Conversation extraction failed";
        throw new Error(reason);
      }

      conversations.push({
        index: entry.queueIndex,
        conversation: {
          id: entry.id || entry.url,
          title: payload.conversation.title || entry.title,
          provider: "ui",
          messages: payload.conversation.messages
        }
      });
    } catch (error) {
      entryFailures.push({
        id: entry.id || entry.url,
        title: entry.title,
        reason: error instanceof Error ? error.message : "Unknown worker tab extraction failure"
      });
    } finally {
      completedCount += 1;
      onProgress?.({
        provider: "ui",
        phase: "collect",
        current: completedCount,
        total,
        title: entry.title
      });
      logger.debug("worker_entry_finished", {
        tabId,
        completed: completedCount,
        total,
        entryId: entry.id
      });
    }
  }
}

async function sendRunnerMessage(chromeApi, tabId, payload) {
  let lastError = null;

  for (let attempt = 0; attempt < RUNNER_MESSAGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await chromeApi.tabs.sendMessage(tabId, payload);
    } catch (error) {
      lastError = error;
      try {
        await chromeApi.scripting.executeScript({
          target: { tabId },
          files: ["content/runner.js"]
        });
      } catch (injectError) {
        lastError = injectError;
      }

      try {
        return await chromeApi.tabs.sendMessage(tabId, payload);
      } catch (retryError) {
        lastError = retryError;
      }

      if (attempt < RUNNER_MESSAGE_MAX_ATTEMPTS - 1) {
        await sleep(RUNNER_MESSAGE_RETRY_INTERVAL_MS);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Runner message failed after retries");
}

async function waitForTabComplete(chromeApi, tabId, logger = null) {
  for (let attempt = 0; attempt < TAB_READY_MAX_POLLS; attempt += 1) {
    const tab = await chromeApi.tabs.get(tabId);
    if (tab?.status === "complete") {
      return;
    }

    if (await isTabDocumentReady(chromeApi, tabId)) {
      logger?.debug?.("worker_tab_ready_via_document", {
        tabId,
        attempt: attempt + 1,
        status: tab?.status || "unknown"
      });
      return;
    }

    await sleep(TAB_READY_POLL_INTERVAL_MS);
  }

  if (await isTabDocumentReady(chromeApi, tabId)) {
    logger?.warn?.("worker_tab_complete_timeout_but_document_ready", { tabId });
    return;
  }

  throw new Error(`Worker tab ${tabId} did not finish loading`);
}

async function isTabDocumentReady(chromeApi, tabId) {
  try {
    const results = await chromeApi.scripting.executeScript({
      target: { tabId },
      func: () => document.readyState
    });
    const readyState = results?.[0]?.result;
    return readyState === "interactive" || readyState === "complete";
  } catch (_error) {
    return false;
  }
}

function dedupeEntries(entries) {
  const deduped = [];
  const seen = new Set();

  for (const entry of entries) {
    const key = entry.id || entry.url || entry.title;
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
