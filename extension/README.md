# extension Manifest

浏览器插件代码目录，负责采集 Kimi 会话并导出 ZIP。
`core/` 放业务核心，`content/` 负责页面执行，根目录放 MV3 入口文件。

## Files
- `manifest.json`: Chrome MV3 配置。
- `background.js`: 后台下载与消息转发。
- `popup.html`: 弹窗页面结构。
- `popup.css`: 弹窗样式。
- `popup.js`: 弹窗交互逻辑。
- `core/`: 业务核心模块。
- `content/`: 页面采集入口与 DOM 适配器。
- `vendor/`: 三方静态依赖目录（当前预留）。
