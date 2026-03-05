// [Input] 用户点击导出按钮的 UI 事件。
// [Output] 发起后台导出并更新弹窗状态文本。
// [Pos] 弹窗交互控制器。
const START_EXPORT_MESSAGE = "KIMI_EXPORT_START";

const statusEl = document.getElementById("status");
const exportButton = document.getElementById("export-btn");

exportButton?.addEventListener("click", async () => {
  setStatus("Running export...");
  setBusy(true);

  try {
    const response = await sendRuntimeMessage({ type: START_EXPORT_MESSAGE });
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : "Export request failed");
    }

    const summary = `Done\nProvider: ${response.provider}\nSuccess: ${response.stats.success}\nFailed: ${response.stats.failed}`;
    setStatus(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown popup error";
    setStatus(`Failed: ${message}`);
  } finally {
    setBusy(false);
  }
});

function setBusy(busy) {
  if (!exportButton) {
    return;
  }
  exportButton.disabled = busy;
  exportButton.textContent = busy ? "Exporting..." : "Export All";
}

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
