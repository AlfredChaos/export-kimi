# tests Manifest

包含核心逻辑的单元测试与最小夹具，保障重构安全。
以 `node --test` 执行，覆盖序列化、压缩、Provider与回退编排。

## Files
- `README.md`: tests 目录微架构说明。
- `smoke.test.mjs`: manifest 与入口配置冒烟测试。
- `markdown.test.mjs`: Markdown 序列化测试。
- `zip.test.mjs`: ZIP 打包二进制测试。
- `dom-adapter.test.mjs`: DOM 结构提取测试。
- `api-provider.test.mjs`: APIProvider 抽取与采集测试。
- `ui-provider.test.mjs`: UIProvider 回退遍历测试。
- `orchestrator.test.mjs`: 方案C回退编排测试。
- `fixtures/`: 页面夹具目录。
