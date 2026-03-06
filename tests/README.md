# tests Manifest

包含核心逻辑的单元测试与最小夹具，保障重构安全。
以 `node --test` 执行，覆盖序列化、压缩、Provider与回退编排。

## Files
- `README.md`: tests 目录微架构说明。
- `smoke.test.mjs`: manifest 与入口配置冒烟测试（含 module worker 与消息协议校验）。
- `markdown.test.mjs`: Markdown 序列化测试。
- `zip.test.mjs`: ZIP 打包二进制测试。
- `dom-adapter.test.mjs`: DOM 结构提取测试（含“查看全部”入口识别、query URL 与 document 级 UUID 兜底提取）。
- `api-provider.test.mjs`: APIProvider 抽取与采集测试。
- `ui-provider.test.mjs`: UIProvider driver 编排测试（含去重、失败保留与空结果保护）。
- `orchestrator.test.mjs`: 方案C回退编排测试。
- `runner.test.mjs`: 内容脚本重复注入安全测试。
- `runner-actions.test.mjs`: 内容脚本动作测试（history-only 发现、document 兜底 + 当前页提取等待）。
- `worker-tab-export.test.mjs`: 后台 history 发现页 + 5 并发工作标签页导出测试（含“tab 长时间 loading 但 document 已可用”回归）。
- `fixtures/`: 页面夹具目录。
