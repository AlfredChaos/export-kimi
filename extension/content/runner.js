// [Input] 后台发来的KIMI_EXPORT_RUN消息。
// [Output] 导出结果（ZIP base64、统计信息、Provider来源）。
// [Pos] 内容脚本执行入口与动态模块装配层。
const RUN_EXPORT_MESSAGE = "KIMI_EXPORT_RUN";

if (!globalThis.__kimiExporterRunnerBound) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== RUN_EXPORT_MESSAGE) {
      return undefined;
    }

    runExport()
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
}

async function runExport() {
  const [{ APIProvider }, { UIProvider }, { ExportOrchestrator, bytesToBase64 }, { createLogger }] = await Promise.all([
    import(chrome.runtime.getURL("core/api-provider.js")),
    import(chrome.runtime.getURL("core/ui-provider.js")),
    import(chrome.runtime.getURL("core/export-orchestrator.js")),
    import(chrome.runtime.getURL("core/logger.js"))
  ]);

  const logger = createLogger("Runner");

  const apiProvider = new APIProvider({
    windowObj: window,
    logger: logger.child("API")
  });

  const uiProvider = new UIProvider({
    windowObj: window,
    logger: logger.child("UI")
  });

  const orchestrator = new ExportOrchestrator({
    providers: [apiProvider, uiProvider],
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
