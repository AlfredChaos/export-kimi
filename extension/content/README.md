# content Manifest

运行在 kimi 页面上下文，负责触发采集并调用核心模块。
该层直接接触 DOM，承担页面结构变化的兼容逻辑。

## Files
- `README.md`: content 目录微架构说明。
- `runner.js`: 接收后台消息并执行导出任务。
- `dom-adapter.js`: 历史会话列表与消息DOM解析器。
