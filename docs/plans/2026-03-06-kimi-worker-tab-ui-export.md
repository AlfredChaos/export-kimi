# Kimi Worker Tab UI Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fragile DOM-only UI fallback with a history-only worker-tab traversal flow that discovers all Kimi chat UUIDs from `/chat/history`, extracts `/chat/<uuid>` pages in 5-way parallel, and downloads a ZIP locally.

**Architecture:** Keep `APIProvider` as the fast path in the active tab. When API export fails, background service worker opens a dedicated `/chat/history` discovery tab, extracts all history references there, then runs a 5-worker tab pool that visits `/chat/<uuid>` URLs without disturbing the user's current page. Content runner must be safe under repeated script injection.

**Tech Stack:** Chrome Extension MV3 module service worker, Vanilla JavaScript ES modules, Node.js test runner, ESLint, native ZIP builder.

---

### Task 1: 锁定 history-only 发现与 URL 规则

**Files:**
- Modify: `extension/content/dom-adapter.js`
- Modify: `tests/dom-adapter.test.mjs`
- Modify: `tests/fixtures/chat-page.html`

**Step 1: 写失败测试**

覆盖：
- 只接受 `/chat/<uuid>` 为目标 URL；
- `/chat/history` 页面能返回 UUID + URL；
- 历史页本身不被当作正文页。

**Step 2: 运行失败测试**

Run: `node --test tests/dom-adapter.test.mjs`
Expected: FAIL with missing UUID/url assertions.

**Step 3: 最小实现**

- 抽出 `extractConversationRef` / `isChatConversationUrl` 等工具；
- 历史页解析统一返回 `{ id, title, url, source }`；
- 保持正文提取逻辑只服务目标 chat 页。

**Step 4: 复跑测试**

Run: `node --test tests/dom-adapter.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/content/dom-adapter.js tests/dom-adapter.test.mjs tests/fixtures/chat-page.html
git commit -m "test(content): add url-aware conversation discovery"
```

### Task 2: 重写 UIProvider/runner actions 为 history-only 编排

**Files:**
- Modify: `extension/core/ui-provider.js`
- Modify: `tests/ui-provider.test.mjs`

**Step 1: 写失败测试**

覆盖：
- history-only 引用发现；
- 逐 URL 抽取正文；
- 正文异步渲染等待；
- 单条正文失败不影响整体 ZIP。

**Step 2: 运行失败测试**

Run: `node --test tests/ui-provider.test.mjs`
Expected: FAIL with old DOM-bound provider behavior.

**Step 3: 最小实现**

- runner actions 只依赖 `/chat/history` 发现和 `/chat/<uuid>` 抽取；
- UIProvider 只保留 driver 抽象与测试用途；
- 失败统一累计到 `failures`。

**Step 4: 复跑测试**

Run: `node --test tests/ui-provider.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/core/ui-provider.js tests/ui-provider.test.mjs
git commit -m "refactor(core): make ui provider worker-driver based"
```

### Task 3: 修复 content runner 重复注入并扩展消息协议

**Files:**
- Modify: `extension/content/runner.js`
- Add/Modify Tests: `tests/smoke.test.mjs`

**Step 1: 写失败测试**

覆盖 runner 支持：
- `KIMI_EXPORT_API_ONLY`
- `KIMI_DISCOVER_ALL_HISTORY_ENTRIES`
- `KIMI_EXTRACT_CURRENT_CHAT`
- 重复注入不抛 `Identifier ... has already been declared`

**Step 2: 运行失败测试**

Run: `node --test tests/smoke.test.mjs`
Expected: FAIL with missing runner/export contract assertions.

**Step 3: 最小实现**

- 将现有 `runExport()` 拆为三个显式动作；
- 用 IIFE/幂等守卫包裹 runner 顶层，允许重试注入；
- API only 保持原有内容脚本上下文；
- 发现/提取接口返回标准 JSON 结果。

**Step 4: 复跑测试**

Run: `node --test tests/smoke.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/content/runner.js tests/smoke.test.mjs
git commit -m "feat(content): split runner into api discovery extract commands"
```

### Task 4: 后台 history 发现页 + 5 并发工作标签页链路与下载

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/background.js`
- Modify: `tests/orchestrator.test.mjs`

**Step 1: 写失败测试**

覆盖：
- API only 失败后，后台切到 UI worker flow；
- 后台先打开 `/chat/history` 发现全部 UUID；
- 默认并发 5 个工作标签页访问 URL；
- 有结果时一定调用下载；
- 失败项进入 `FAILED_ITEMS.md`。

**Step 2: 运行失败测试**

Run: `node --test tests/orchestrator.test.mjs`
Expected: FAIL with background worker flow missing.

**Step 3: 最小实现**

- service worker 改为 module；
- 后台动态/静态导入 `ExportOrchestrator`、`worker-tab-export` 等；
- 新增 history 发现页管理、5 worker pool、页面就绪等待、消息发送与关闭清理；
- 导出成功后调用 `chrome.downloads.download`。

**Step 4: 复跑测试**

Run: `node --test tests/orchestrator.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/manifest.json extension/background.js tests/orchestrator.test.mjs
git commit -m "feat(background): add worker tab ui export fallback"
```

### Task 5: 全量验证与文档回流

**Files:**
- Modify: `extension/README.md`
- Modify: `extension/core/README.md`
- Modify: `extension/content/README.md`
- Modify: `tests/README.md`
- Modify: `tests/fixtures/README.md`
- Modify: `docs/plans/README.md`

**Step 1: 运行全量验证**

Run: `npm test && npm run lint`
Expected: PASS with zero failures and zero lint warnings.

**Step 2: 更新文档**

- 补充 worker tab 导出路径；
- 补充 URL 规则与下载保证；
- 同步测试说明。

**Step 3: Commit**

```bash
git add extension tests docs/plans
git commit -m "docs(export): document worker tab ui export flow"
```
