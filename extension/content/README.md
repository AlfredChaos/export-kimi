# content Manifest

运行在 kimi 页面上下文，负责触发采集并调用核心模块。
该层直接接触 DOM，承担页面结构变化的兼容逻辑。

## Files
- `README.md`: content 目录微架构说明。
- `runner.js`: 可重复注入安全的消息入口，分发 API 导出 / history 发现 / 正文提取动作。
- `runner-actions.js`: 内容脚本动作集合，负责 API-only 导出、`/chat/history` 全量发现（含“查看全部”与 document 兜底）与当前页提取。
- `dom-adapter.js`: 历史会话列表与消息DOM解析器（含 `/chat/<uuid>` 规则、query/hash 兼容与 history 页 UUID 兜底发现）。
