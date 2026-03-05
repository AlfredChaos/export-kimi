// [Input] Kimi页面DOM与DOMAdapter提取能力。
// [Output] 通过界面遍历得到的标准化会话集合。
// [Pos] 方案C的UI回退数据源实现。
import { createLogger } from "./logger.js";
import { normalizeTitle } from "./models.js";
import { ConversationProvider, ProviderError } from "./provider.js";
import { DOMAdapter } from "../content/dom-adapter.js";

const OPEN_CHAT_DELAY_MS = 450;

export class UIProvider extends ConversationProvider {
  constructor({
    windowObj = window,
    logger = createLogger("UIProvider"),
    adapterFactory = (documentObj, adapterLogger) => new DOMAdapter(documentObj, adapterLogger)
  } = {}) {
    super("ui", logger);
    this.windowObj = windowObj;
    this.adapterFactory = adapterFactory;
  }

  async collectAll(onProgress) {
    const adapter = this.adapterFactory(this.windowObj.document, this.logger.child("DOM"));
    const sidebar = adapter.findHistorySidebar();
    if (!sidebar) {
      throw new ProviderError(this.name, "History sidebar not found in current page");
    }

    await adapter.expandHistoryList(sidebar);
    const entries = adapter.collectConversationEntries(sidebar);
    if (!entries.length) {
      throw new ProviderError(this.name, "No conversation entries discovered from sidebar");
    }

    const conversations = [];
    const failures = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      onProgress?.({ provider: this.name, phase: "collect", current: index + 1, total: entries.length, title: entry.title });

      try {
        await adapter.openConversation(entry);
        await sleep(OPEN_CHAT_DELAY_MS);

        const extracted = adapter.extractCurrentConversation(entry.title);
        if (!extracted.messages.length) {
          throw new Error("No messages extracted from current conversation view");
        }

        conversations.push({
          id: entry.key,
          title: normalizeTitle(extracted.title || entry.title),
          provider: this.name,
          messages: extracted.messages
        });
      } catch (error) {
        failures.push({
          id: entry.key,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
