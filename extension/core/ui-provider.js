// [Input] 会话发现/加载 driver 或当前页面 DOM 适配能力。
// [Output] 基于 UI 回退链路聚合出的标准化会话与失败项。
// [Pos] 方案C中可切换为工作标签页 driver 的 UI 回退编排器。
import { createLogger } from "./logger.js";
import { normalizeTitle } from "./models.js";
import { ConversationProvider, ProviderError } from "./provider.js";
import { DOMAdapter } from "../content/dom-adapter.js";

const OPEN_CHAT_DELAY_MS = 450;

export class UIProvider extends ConversationProvider {
  constructor({
    windowObj = globalThis.window,
    driver,
    logger = createLogger("UIProvider"),
    adapterFactory = (documentObj, adapterLogger) => new DOMAdapter(documentObj, adapterLogger)
  } = {}) {
    super("ui", logger);
    this.driver = driver || createDomDriver({ windowObj, adapterFactory, logger: this.logger.child("DOM") });
  }

  async collectAll(onProgress) {
    const failures = [];
    const recentEntries = await safeDiscoverEntries(
      () => this.driver.discoverRecentEntries(),
      failures,
      { id: "recent-discovery", title: "最近会话" }
    );
    const historyEntries = await safeDiscoverEntries(
      () => this.driver.discoverHistoryEntries?.() || [],
      failures,
      { id: "history-discovery", title: "查看全部" }
    );
    const entries = mergeEntries(recentEntries, historyEntries);

    if (!entries.length) {
      throw new ProviderError(this.name, "No conversation entries discovered from UI fallback", failures);
    }

    const conversations = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      onProgress?.({ provider: this.name, phase: "collect", current: index + 1, total: entries.length, title: entry.title });

      try {
        const conversation = await this.driver.loadConversation(entry);
        if (!conversation?.messages?.length) {
          throw new Error("No messages extracted from current conversation view");
        }

        conversations.push({
          id: entry.id || entry.key || entry.url,
          title: normalizeTitle(conversation.title || entry.title),
          provider: this.name,
          messages: conversation.messages
        });
      } catch (error) {
        failures.push({
          id: entry.id || entry.key || entry.url || "unknown-ui-entry",
          title: normalizeTitle(entry.title),
          reason: error instanceof Error ? error.message : "Unknown UI chat failure"
        });
      }
    }

    if (!conversations.length) {
      throw new ProviderError(this.name, "UI provider failed for all conversations", failures);
    }

    return { provider: this.name, conversations, failures };
  }
}

async function safeDiscoverEntries(loader, failures, failureItem) {
  try {
    const entries = await loader();
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    failures.push({
      id: failureItem.id,
      title: failureItem.title,
      reason: error instanceof Error ? error.message : "Unknown UI discovery failure"
    });
    return [];
  }
}

function mergeEntries(primaryEntries, secondaryEntries) {
  const deduped = [];
  const seenKeys = new Set();

  for (const entry of [...primaryEntries, ...secondaryEntries]) {
    const key = normalizeTitle(entry.id || entry.url || entry.key || entry.title, "");
    if (!key || seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function createDomDriver({ windowObj, adapterFactory, logger }) {
  const adapter = adapterFactory(windowObj?.document, logger);
  let historyPortalEntry = null;

  return {
    async discoverRecentEntries() {
      const sidebar = adapter.findHistorySidebar();
      if (!sidebar) {
        throw new Error("History sidebar not found in current page");
      }

      await adapter.expandHistoryList(sidebar);
      historyPortalEntry = adapter.findHistoryPortalEntry?.(sidebar) ?? null;
      return adapter.collectConversationEntries(sidebar, { source: "sidebar" });
    },

    async discoverHistoryEntries() {
      if (!historyPortalEntry) {
        return [];
      }

      const historyRoot = await adapter.ensureHistoryPortalVisible(historyPortalEntry);
      await sleep(OPEN_CHAT_DELAY_MS);
      await adapter.expandHistoryList(historyRoot);
      return adapter.collectConversationEntries(historyRoot, { source: "history" });
    },

    async loadConversation(entry) {
      if (entry.source === "history" && historyPortalEntry) {
        await adapter.ensureHistoryPortalVisible(historyPortalEntry);
        await sleep(OPEN_CHAT_DELAY_MS);
      }

      await adapter.openConversation(entry);
      await sleep(OPEN_CHAT_DELAY_MS);
      return adapter.extractCurrentConversation(entry.title);
    }
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
