// [Input] 页面 window/document、DOMAdapter 与 APIProvider 依赖。
// [Output] API-only 导出、history引用发现（含 portal/document 兜底）与当前会话提取动作。
// [Pos] 内容脚本消息分发层依赖的可复用动作模块。
import { APIProvider } from "../core/api-provider.js";
import { bytesToBase64, ExportOrchestrator } from "../core/export-orchestrator.js";
import { createLogger } from "../core/logger.js";
import { DOMAdapter } from "./dom-adapter.js";

const EXTRACT_RETRY_INTERVAL_MS = 250;
const EXTRACT_MAX_ATTEMPTS = 24;
const HISTORY_DISCOVERY_RETRY_INTERVAL_MS = 250;
const HISTORY_DISCOVERY_MAX_ATTEMPTS = 24;

export async function runApiOnlyExport({
  windowObj = window,
  logger = createLogger("RunnerActions").child("API")
} = {}) {
  const apiProvider = new APIProvider({
    windowObj,
    logger: logger.child("Provider")
  });

  const orchestrator = new ExportOrchestrator({
    providers: [apiProvider],
    logger: logger.child("Orchestrator")
  });

  const result = await orchestrator.run((progress) => {
    logger.info("progress", progress);
  });

  return {
    ok: true,
    provider: result.provider,
    fileName: result.fileName,
    stats: result.stats,
    zipBase64: bytesToBase64(result.bytes)
  };
}

export async function discoverAllHistoryEntries({
  windowObj = window,
  logger = createLogger("RunnerActions").child("Discover"),
  adapterFactory = (documentObj, adapterLogger) => new DOMAdapter(documentObj, adapterLogger)
} = {}) {
  const adapter = adapterFactory(windowObj.document, logger.child("DOM"));
  const entries = await waitForHistoryEntriesReady({ adapter, logger });
  return {
    ok: true,
    entries,
    failures: []
  };
}

export const discoverUIEntries = discoverAllHistoryEntries;

export async function extractCurrentConversation({
  windowObj = window,
  fallbackTitle = "Untitled Conversation",
  logger = createLogger("RunnerActions").child("Extract"),
  adapterFactory = (documentObj, adapterLogger) => new DOMAdapter(documentObj, adapterLogger)
} = {}) {
  const adapter = adapterFactory(windowObj.document, logger.child("DOM"));
  return waitForConversationReady({
    adapter,
    fallbackTitle,
    logger
  });
}

async function waitForHistoryEntriesReady({ adapter, logger }) {
  let lastEntries = [];
  let historyPortalEntry = null;

  for (let attempt = 0; attempt < HISTORY_DISCOVERY_MAX_ATTEMPTS; attempt += 1) {
    let historyRoot = adapter.findHistoryPortalRoot();
    if (!historyRoot) {
      const sidebar = adapter.findHistorySidebar?.();
      if (sidebar) {
        await adapter.expandHistoryList(sidebar);
        historyPortalEntry = historyPortalEntry || adapter.findHistoryPortalEntry?.(sidebar) || null;
      }

      if (historyPortalEntry && adapter.ensureHistoryPortalVisible) {
        try {
          historyRoot = await adapter.ensureHistoryPortalVisible(historyPortalEntry);
        } catch (error) {
          logger.debug("history_portal_not_ready", {
            attempt: attempt + 1,
            reason: error instanceof Error ? error.message : "Unknown history portal open error"
          });
        }
      }
    }

    if (historyRoot) {
      await adapter.expandHistoryList(historyRoot);
      lastEntries = adapter.collectConversationEntries(historyRoot, { source: "history" });
      if (lastEntries.length > 0) {
        return lastEntries;
      }
    }

    if (adapter.collectConversationEntriesFromDocument) {
      lastEntries = adapter.collectConversationEntriesFromDocument({ source: "history" });
      if (lastEntries.length > 0) {
        return lastEntries;
      }
    }

    if (attempt < HISTORY_DISCOVERY_MAX_ATTEMPTS - 1) {
      logger.debug("history_entries_not_ready", {
        attempt: attempt + 1,
        discovered: lastEntries.length
      });
      await sleep(HISTORY_DISCOVERY_RETRY_INTERVAL_MS);
    }
  }

  throw new Error("No history entries discovered from /chat/history");
}

async function waitForConversationReady({ adapter, fallbackTitle, logger }) {
  let lastConversation = {
    title: fallbackTitle,
    messages: []
  };

  for (let attempt = 0; attempt < EXTRACT_MAX_ATTEMPTS; attempt += 1) {
    lastConversation = adapter.extractCurrentConversation(fallbackTitle);
    if (lastConversation.messages.length > 0) {
      return lastConversation;
    }

    if (attempt < EXTRACT_MAX_ATTEMPTS - 1) {
      logger.debug("conversation_not_ready", {
        attempt: attempt + 1,
        title: lastConversation.title
      });
      await sleep(EXTRACT_RETRY_INTERVAL_MS);
    }
  }

  return lastConversation;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
