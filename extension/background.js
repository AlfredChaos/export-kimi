// [Input] Popup 发起的导出消息与当前活动 Kimi 标签页上下文。
// [Output] 本地下载任务（工作标签页 UI 自动化导出）结果。
// [Pos] MV3 module service worker 导出编排入口。
import { createLogger } from "./core/logger.js";
import { START_EXPORT_MESSAGE } from "./core/message-types.js";
import { exportViaWorkerTabUI } from "./core/worker-tab-export.js";

const logger = createLogger("Background");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== START_EXPORT_MESSAGE) {
    return undefined;
  }

  handleStartExport()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown export error" });
    });

  return true;
});

async function handleStartExport() {
  const activeTab = await getActiveTab();
  ensureKimiTab(activeTab);

  return exportViaWorkerTabUI({
    chromeApi: chrome,
    activeTab,
    logger: logger.child("WorkerTab")
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || !tabs[0].id) {
    throw new Error("No active browser tab found");
  }
  return tabs[0];
}

function ensureKimiTab(tab) {
  if (!tab.url || !tab.url.startsWith("https://www.kimi.com/")) {
    throw new Error("Active tab is not on https://www.kimi.com/");
  }
}
