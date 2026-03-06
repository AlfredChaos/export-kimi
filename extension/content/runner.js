// [Input] 后台发来的 history 发现与正文提取消息。
// [Output] 标准化消息响应（历史会话引用列表、当前会话正文）。
// [Pos] 内容脚本执行入口与动态动作装配层。
(() => {
  const DISCOVER_ALL_HISTORY_ENTRIES_MESSAGE = "KIMI_DISCOVER_ALL_HISTORY_ENTRIES";
  const EXTRACT_CURRENT_CHAT_MESSAGE = "KIMI_EXTRACT_CURRENT_CHAT";

  if (globalThis.__kimiExporterRunnerBound) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const action = resolveAction(message);
    if (!action) {
      return undefined;
    }

    action()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Runner failed with unknown error"
        });
      });

    return true;
  });

  globalThis.__kimiExporterRunnerBound = true;

  function resolveAction(message) {
    if (!message || typeof message.type !== "string") {
      return null;
    }

    if (message.type === DISCOVER_ALL_HISTORY_ENTRIES_MESSAGE) {
      return () => invokeAction("discoverAllHistoryEntries");
    }

    if (message.type === EXTRACT_CURRENT_CHAT_MESSAGE) {
      return async () => {
        const conversation = await invokeAction("extractCurrentConversation", {
          fallbackTitle: message.fallbackTitle
        });
        return {
          ok: true,
          conversation
        };
      };
    }

    return null;
  }

  async function invokeAction(actionName, options = {}) {
    const moduleUrl = chrome.runtime.getURL("content/runner-actions.js");
    const actions = await import(moduleUrl);
    return actions[actionName]({
      windowObj: window,
      ...options
    });
  }
})();
