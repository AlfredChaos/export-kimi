// [Input] 运行阶段事件与错误对象。
// [Output] 统一前缀日志函数，便于定位模块来源。
// [Pos] 导出流程可观测性基础设施。
export function createLogger(scope) {
  const prefix = `[KimiExporter:${scope}]`;

  return {
    debug: (message, detail) => {
      if (detail === undefined) {
        console.debug(`${prefix} ${message}`);
      } else {
        console.debug(`${prefix} ${message}`, detail);
      }
    },
    info: (message, detail) => {
      if (detail === undefined) {
        console.info(`${prefix} ${message}`);
      } else {
        console.info(`${prefix} ${message}`, detail);
      }
    },
    warn: (message, detail) => {
      if (detail === undefined) {
        console.warn(`${prefix} ${message}`);
      } else {
        console.warn(`${prefix} ${message}`, detail);
      }
    },
    error: (message, detail) => {
      if (detail === undefined) {
        console.error(`${prefix} ${message}`);
      } else {
        console.error(`${prefix} ${message}`, detail);
      }
    },
    child: (subScope) => createLogger(`${scope}:${subScope}`)
  };
}
