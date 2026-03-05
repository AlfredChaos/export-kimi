# core Manifest

封装导出领域模型、Provider、序列化与压缩能力。
该层不直接依赖 popup UI，专注采集编排与文件生成。

## Files
- `README.md`: core 目录微架构说明。
- `models.js`: 领域模型归一化与文件名安全规则。
- `logger.js`: 模块化日志工具。
- `provider.js`: Provider抽象与统一错误类型。
- `api-provider.js`: 私有接口抓取实现（方案C优先链路）。
- `ui-provider.js`: DOM遍历抓取实现（方案C回退链路）。
- `markdown.js`: 会话与失败项的 Markdown 序列化。
- `zip.js`: 原生ZIP二进制打包实现。
- `export-orchestrator.js`: Provider回退与导出总编排。
