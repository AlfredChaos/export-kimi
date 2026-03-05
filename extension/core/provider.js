// [Input] Provider具体实现与采集进度回调。
// [Output] 统一Provider接口和错误类型定义。
// [Pos] API/UI 数据源抽象层。
import { createLogger } from "./logger.js";

export class ProviderError extends Error {
  constructor(providerName, message, cause) {
    super(message);
    this.name = "ProviderError";
    this.providerName = providerName;
    this.cause = cause;
  }
}

export class ConversationProvider {
  constructor(name, logger = createLogger(name)) {
    this.name = name;
    this.logger = logger;
  }

  // 子类必须实现：返回 { provider, conversations, failures }
  async collectAll(_onProgress) {
    throw new ProviderError(this.name, "collectAll is not implemented");
  }
}
