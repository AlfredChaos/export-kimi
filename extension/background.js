// [Input] Popup start messages and active Kimi tab context.
// [Output] Triggered download task using ZIP base64 from content script.
// [Pos] MV3 service worker as extension orchestration gateway.
const START_EXPORT_MESSAGE = "KIMI_EXPORT_START";
const RUN_EXPORT_MESSAGE = "KIMI_EXPORT_RUN";

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

  const runnerResult = await invokeContentRunner(activeTab.id);
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

async function invokeContentRunner(tabId) {
  try {
    const directResult = await chrome.tabs.sendMessage(tabId, { type: RUN_EXPORT_MESSAGE });
    return assertRunnerResult(directResult);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/runner.js"]
    });
    const retryResult = await chrome.tabs.sendMessage(tabId, { type: RUN_EXPORT_MESSAGE });
    return assertRunnerResult(retryResult);
  }
}

function assertRunnerResult(payload) {
  if (!payload || payload.ok !== true) {
    const message = payload && typeof payload.error === "string" ? payload.error : "Runner failed without details";
    throw new Error(message);
  }
  if (!payload.zipBase64 || !payload.fileName) {
    throw new Error("Runner returned invalid download payload");
  }
  return payload;
}
