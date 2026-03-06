# Kimi 工作标签页 UI 导出设计

## 1. 背景
- 现有 UI 回退链路把“侧栏点击 + 当前页提取”混在一起，遇到《查看全部》历史页后会中断。
- 用户已明确：**只有 `https://www.kimi.com/chat/<uuid>` 才是目标会话页**；历史页只用于发现会话 UUID，不应直接当作会话正文页提取。

## 2. 目标
- 保留 `APIProvider` 优先链路。
- 当 API 失败时，切换到 **后台工作标签页导出**：
  1. 后台单独打开 `https://www.kimi.com/chat/history`，只从该页发现全部历史 UUID。
  2. 不再依赖左侧最近会话，也不打断用户当前正在查看的 Kimi 页面。
  3. 后台维护默认 **5** 个工作标签页，并发访问 `/chat/<uuid>`。
  4. 每个目标页由内容脚本提取正文，后台统一打包 ZIP 并触发下载。
- 即使部分会话失败，也必须下载已有结果，并把失败写入 `FAILED_ITEMS.md`。

## 3. 架构
- `background.js`
  - 改为 MV3 module service worker。
  - 负责：API 优先尝试、历史发现页生命周期、5 并发工作标签页调度、打包 ZIP、触发下载。
- `content/runner.js`
  - 做成可重复注入安全的幂等入口，避免 `Identifier ... has already been declared`。
  - 从“单一整包导出入口”拆为三类消息：
    - `API_ONLY_EXPORT`：仅在当前页运行 APIProvider。
    - `DISCOVER_ALL_HISTORY_ENTRIES`：在 `/chat/history` 返回 `{ id, title, url }[]`。
    - `EXTRACT_CURRENT_CHAT`：在 `/chat/<uuid>` 页面提取当前会话正文。
- `core/ui-provider.js`
  - 保留为顺序型 driver 编排器，用于抽象 UI fallback 行为与测试。
- `core/worker-tab-export.js`
  - 新增 history-only 发现与 5 并发 worker pool，实现真正的后台并行抓取。
- `content/dom-adapter.js`
  - 专注页面结构解析：
    - 识别有效 chat URL / UUID；
    - `/chat/history` 历史页解析；
    - 当前目标会话正文提取。

## 4. URL 规则
- 目标会话页必须匹配：
  - `https://www.kimi.com/chat/<uuid>`
- 非目标页：
  - `https://www.kimi.com/chat/history`
  - 仅用于发现历史记录 UUID，不能直接提取正文。

## 5. 错误处理
- 发现阶段失败：
  - `/chat/history` 无法返回有效 UUID 时，直接失败并返回明确错误。
- 遍历阶段失败：
  - 单条失败写入 `failures`，继续下一条。
- 下载阶段失败：
  - 直接向 popup 返回明确错误，不吞异常。
- 内容脚本重复注入：
  - runner 入口必须幂等，允许 `chrome.scripting.executeScript` 重试而不抛语法错误。

## 6. 验收标准
- 点击扩展后，若 API 链路失败，后台自动走工作标签页方案。
- 后台自动打开 `/chat/history`，解析全部 UUID 并生成 `/chat/<uuid>` URL。
- 默认并发 5 个工作标签页抓取，不影响用户当前页面。
- ZIP 一定落盘到本地；若部分会话失败，仍包含已成功导出的 Markdown 与 `FAILED_ITEMS.md`。
