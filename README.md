# export_kimi

用于开发 Kimi 历史会话导出浏览器插件（Markdown + ZIP）的工程根目录。
当前以 `docs/` 作为设计与实施计划源，后续 `extension/` 放插件代码、`tests/` 放验证。

## Quick Start
- 安装依赖：`npm install --cache .npm-cache`
- 运行测试：`npm test`
- 运行 lint：`npm run lint`

## 验收步骤
### 自动验收
1. 执行 `npm run lint`，期望无错误退出。
2. 执行 `npm test`，期望全部测试通过。

### 手工验收（Chrome）
1. 打开 `chrome://extensions`，启用开发者模式。
2. 点击“加载已解压的扩展程序”，选择 `extension/` 目录。
3. 在已登录的 `https://www.kimi.com/` 页面点击插件 `Export All`。
4. 浏览器应下载 `kimi-history-YYYYMMDD-HHmmss.zip`。
5. 解压后应看到每条会话一个 `.md` 文件，部分失败场景下额外包含 `FAILED_ITEMS.md`。

## Files
- `README.md`: 根目录微架构说明。
- `.gitignore`: Git 忽略规则（依赖缓存与系统垃圾文件）。
- `docs/`: 设计文档与实施计划。
- `extension/`: 浏览器插件实现代码。
- `tests/`: 单元测试与页面夹具。
