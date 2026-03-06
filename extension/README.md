# extension Manifest

浏览器插件代码目录，负责采集 Kimi 会话并导出 ZIP。
`core/` 放业务核心，`content/` 负责页面执行，根目录放 MV3 入口文件。

## Files
- `manifest.json`: Chrome MV3 配置（含 module service worker 与 content 动态模块暴露）。
- `background.js`: 后台下载入口，先走 API，再回退到 `/chat/history` + 5 并发工作标签页 UI 导出。
- `popup.html`: 弹窗页面结构。
- `popup.css`: 弹窗样式。
- `popup.js`: 弹窗交互逻辑。
- `core/`: 业务核心模块。
- `content/`: 页面采集入口、history-only 动作拆分与 DOM 适配器。
- `vendor/`: 三方静态依赖目录（当前预留）。
