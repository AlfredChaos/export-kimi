// [Input] Popup 发起的导出消息与当前活动 Kimi 标签页上下文。
// [Output] 本地下载任务（API 快路径或工作标签页 UI 回退）结果。
// [Pos] MV3 module service worker 导出编排入口。
import { createLogger } from "./core/logger.js";
import {
  RUN_API_ONLY_MESSAGE,
  START_EXPORT_MESSAGE
} from "./core/message-types.js";
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

  try {
    const runnerResult = await invokeRunnerMessage(activeTab.id, { type: RUN_API_ONLY_MESSAGE });
    const downloadId = await chrome.downloads.download({
      url: `data:application/zip;base64,${runnerResult.zipBase64}`,
      filename: runnerResult.fileName,
      saveAs: true
    });

    return {
      downloadId,
      stats: runnerResult.stats,
      provider: runnerResult.provider,
      fileName: runnerResult.fileName
    };
  } catch (error) {
    logger.warn("api_export_failed", {
      error: error instanceof Error ? error.message : "Unknown API export failure"
    });
  }

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

async function invokeRunnerMessage(tabId, payload) {
  try {
    const directResult = await chrome.tabs.sendMessage(tabId, payload);
    return assertApiRunnerResult(directResult);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/runner.js"]
    });
    const retryResult = await chrome.tabs.sendMessage(tabId, payload);
    return assertApiRunnerResult(retryResult);
  }
}

function assertApiRunnerResult(payload) {
  if (!payload || payload.ok !== true) {
    const message = payload && typeof payload.error === "string" ? payload.error : "Runner failed without details";
    throw new Error(message);
  }
  if (!payload.zipBase64 || !payload.fileName) {
    throw new Error("Runner returned invalid API export payload");
  }
  return payload;
}
