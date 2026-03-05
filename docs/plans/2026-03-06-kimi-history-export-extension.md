# Kimi History Export Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome MV3 extension that exports all Kimi web chat histories to Markdown files and downloads them as one ZIP.

**Architecture:** Execute Plan C (`APIProvider` first, `UIProvider` fallback) with a unified provider contract. Keep formatting (`markdown.js`) and packaging (`zip.js`) independent from collection so fallback and failure reporting stay deterministic. Wire everything through an orchestrator triggered by popup UI and executed in active Kimi tab.

**Tech Stack:** Chrome Extension MV3, Vanilla JavaScript (ES2022 modules), native ZIP builder (`Uint8Array` + ZIP headers), Node.js test runner (`node --test`), ESLint.

---

## 审查结论（2026-03-06）

- 方案选择：确认采用方案 C（`APIProvider` 优先 + `UIProvider` 回退）。
- 代码一致性：主链路已落地，包含 popup/background/content/core 全链路与测试。
- 发现问题：
  - `dom-adapter.js` 直接使用 `Element/Node` 全局，导致 Node/JSDOM 下测试报 `ReferenceError`。
  - `eslint.config.mjs` 缺失浏览器全局与 catch 变量忽略规则，导致 lint 误报。
  - 计划文本里 ZIP 方案仍写为 JSZip，和实际实现（原生 ZIP）不一致。
- 修订动作：新增 Task 9 收敛上述问题，并同步更新本计划。

## 执行状态（审查后）

| Task | 状态 | 备注 |
| --- | --- | --- |
| Task 1-8 | 已完成 | 功能链路与基础测试均存在。 |
| Task 9 | 已完成 | 修复跨环境 DOM 兼容与 lint 规则缺口。 |

### Task 1: 项目骨架与工具链

**Files:**
- Create: `package.json`
- Create: `eslint.config.mjs`
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/popup.html`
- Create: `extension/popup.css`
- Create: `extension/popup.js`
- Create: `extension/content/runner.js`
- Create: `tests/smoke.test.mjs`

**Step 1: 写一个失败的 smoke 测试（先红）**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('manifest exists and is MV3', () => {
  const text = fs.readFileSync('extension/manifest.json', 'utf8');
  const json = JSON.parse(text);
  assert.equal(json.manifest_version, 3);
});
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/smoke.test.mjs`
Expected: FAIL with `ENOENT: no such file or directory, open 'extension/manifest.json'`.

**Step 3: 写最小实现让测试通过**

```json
{
  "manifest_version": 3,
  "name": "Kimi History Exporter",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting", "downloads"],
  "host_permissions": ["https://www.kimi.com/*"],
  "background": {"service_worker": "background.js"},
  "action": {"default_popup": "popup.html"}
}
```

**Step 4: 复跑测试确认通过**

Run: `node --test tests/smoke.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json eslint.config.mjs extension tests
git commit -m "feat(scaffold): bootstrap mv3 extension structure"
```

### Task 2: 领域模型与 Markdown 序列化

**Files:**
- Create: `extension/core/models.js`
- Create: `extension/core/markdown.js`
- Test: `tests/markdown.test.mjs`

**Step 1: 写失败测试覆盖标题/角色/代码块**

```js
test('serialize conversation to markdown', () => {
  const md = toMarkdown({
    title: '测试会话',
    exportedAt: '2026-03-06T00:00:00.000Z',
    messages: [
      { role: 'user', text: '你好' },
      { role: 'assistant', text: '```js\nconsole.log(1)\n```' }
    ]
  });
  assert.match(md, /^# 测试会话/m);
  assert.match(md, /## USER/m);
  assert.match(md, /## ASSISTANT/m);
});
```

**Step 2: 运行失败测试**

Run: `node --test tests/markdown.test.mjs`
Expected: FAIL with `toMarkdown is not defined` or import error.

**Step 3: 实现最小序列化器**

```js
export function toMarkdown(conversation) {
  const header = `# ${conversation.title}\n\n- ExportedAt: ${conversation.exportedAt}\n`;
  const body = conversation.messages
    .map((msg) => `\n## ${msg.role.toUpperCase()}\n\n${msg.text}\n`)
    .join('');
  return `${header}${body}`;
}
```

**Step 4: 复跑测试**

Run: `node --test tests/markdown.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/core/models.js extension/core/markdown.js tests/markdown.test.mjs
git commit -m "feat(core): add conversation model and markdown serializer"
```

### Task 3: ZIP 打包模块

**Files:**
- Create: `extension/core/zip.js`
- Test: `tests/zip.test.mjs`

**Step 1: 写失败测试（校验 ZIP 魔数 PK）**

```js
test('create zip buffer with PK header', async () => {
  const bytes = await createZipBytes([{ name: 'a.md', content: '# A' }]);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
});
```

**Step 2: 运行测试确认失败**

Run: `node --test tests/zip.test.mjs`
Expected: FAIL with import/module error.

**Step 3: 实现最小打包逻辑**

```js
export function createZipBytes(files) {
  // 生成 local file header + central directory + end of central directory
  // 返回 Uint8Array，可直接转 base64 触发下载
}
```

**Step 4: 复跑测试**

Run: `node --test tests/zip.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/core/zip.js tests/zip.test.mjs
git commit -m "feat(core): add zip packaging module"
```

### Task 4: DOM 适配器（单会话提取）

**Files:**
- Create: `extension/content/dom-adapter.js`
- Create: `tests/fixtures/chat-page.html`
- Test: `tests/dom-adapter.test.mjs`

**Step 1: 写失败测试（固定 HTML fixture）**

```js
test('extract messages from chat DOM', () => {
  const doc = loadFixture('tests/fixtures/chat-page.html');
  const convo = extractConversationFromDocument(doc);
  assert.equal(convo.messages.length, 2);
  assert.equal(convo.messages[0].role, 'user');
});
```

**Step 2: 运行失败测试**

Run: `node --test tests/dom-adapter.test.mjs`
Expected: FAIL with parser/adaptor missing.

**Step 3: 实现最小 DOM 提取**

```js
export function extractConversationFromDocument(doc) {
  const rows = [...doc.querySelectorAll('[data-role]')];
  const messages = rows.map((row) => ({
    role: row.getAttribute('data-role'),
    text: row.textContent?.trim() ?? ''
  }));
  return { title: doc.title || 'Untitled', messages };
}
```

**Step 4: 复跑测试**

Run: `node --test tests/dom-adapter.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/content/dom-adapter.js tests/fixtures/chat-page.html tests/dom-adapter.test.mjs
git commit -m "feat(content): add dom adapter for conversation extraction"
```

### Task 5: UIProvider（遍历全部历史会话）

**Files:**
- Create: `extension/core/provider.js`
- Create: `extension/core/ui-provider.js`
- Test: `tests/ui-provider.test.mjs`

**Step 1: 写失败测试（mock driver 验证遍历顺序）**

```js
test('ui provider iterates all chat entries', async () => {
  const provider = new UIProvider(fakeDriver);
  const list = await provider.collectAll();
  assert.equal(list.length, 3);
});
```

**Step 2: 运行失败测试**

Run: `node --test tests/ui-provider.test.mjs`
Expected: FAIL with `UIProvider` missing.

**Step 3: 实现最小 provider 与接口抽象**

```js
export class ConversationProvider {
  async collectAll() {
    throw new Error('Not implemented');
  }
}

export class UIProvider extends ConversationProvider {
  constructor(driver) { super(); this.driver = driver; }
  async collectAll() {
    const ids = await this.driver.listConversationIds();
    return Promise.all(ids.map((id) => this.driver.openAndExtract(id)));
  }
}
```

**Step 4: 复跑测试**

Run: `node --test tests/ui-provider.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/core/provider.js extension/core/ui-provider.js tests/ui-provider.test.mjs
git commit -m "feat(core): implement ui provider traversal"
```

### Task 6: 编排器与下载触发

**Files:**
- Create: `extension/core/export-orchestrator.js`
- Modify: `extension/content/runner.js`
- Modify: `extension/background.js`
- Modify: `extension/popup.js`
- Test: `tests/orchestrator.test.mjs`

**Step 1: 写失败测试（mock provider + serializer + zipper）**

```js
test('orchestrator returns downloadable zip payload', async () => {
  const result = await orchestrator.run();
  assert.equal(result.fileName.endsWith('.zip'), true);
  assert.ok(result.bytes.length > 0);
});
```

**Step 2: 运行失败测试**

Run: `node --test tests/orchestrator.test.mjs`
Expected: FAIL with missing orchestrator implementation.

**Step 3: 实现最小编排逻辑并连接 popup/background/content**

```js
const conversations = await provider.collectAll();
const markdownFiles = conversations.map((c) => ({ name: toSafeName(c.title), content: toMarkdown(c) }));
const bytes = createZipBytes(markdownFiles);
return { fileName: buildZipName(), bytes };
```

**Step 4: 复跑测试**

Run: `node --test tests/orchestrator.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/core/export-orchestrator.js extension/background.js extension/popup.js extension/content/runner.js tests/orchestrator.test.mjs
git commit -m "feat(export): wire orchestrator and one-click download flow"
```

### Task 7: 失败收敛与可观测性

**Files:**
- Create: `extension/core/logger.js`
- Modify: `extension/core/export-orchestrator.js`
- Test: `tests/error-handling.test.mjs`

**Step 1: 写失败测试（部分失败仍产出 ZIP）**

```js
test('partial failures still produce zip with FAILED_ITEMS.md', async () => {
  const output = await orchestrator.run();
  assert.equal(output.fileName.endsWith('.zip'), true);
  assert.match(output.debugSummary, /failed: 1/);
});
```

**Step 2: 运行失败测试**

Run: `node --test tests/error-handling.test.mjs`
Expected: FAIL because partial-failure path missing.

**Step 3: 实现部分失败策略**

```js
if (failedItems.length > 0) {
  markdownFiles.push({
    name: 'FAILED_ITEMS.md',
    content: buildFailedItemsReport(failedItems)
  });
}
```

**Step 4: 复跑测试**

Run: `node --test tests/error-handling.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension/core/logger.js extension/core/export-orchestrator.js tests/error-handling.test.mjs
git commit -m "feat(export): add partial failure report and logging"
```

### Task 8: 质量门禁与手工验收

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/plans/README.md`

**Step 1: 运行全量测试**

Run: `node --test tests/*.test.mjs`
Expected: all PASS.

**Step 2: 运行 lint**

Run: `npm run lint`
Expected: no errors.

**Step 3: 插件手工验收（Chrome）**

Run:
1. `chrome://extensions` 打开开发者模式。
2. 加载 `extension/` 目录。
3. 打开已登录 `https://www.kimi.com/`。
4. 点击插件 `Export All`。

Expected:
- 浏览器开始下载 `kimi-history-*.zip`。
- ZIP 中包含多份 `.md` 与可选 `FAILED_ITEMS.md`。

**Step 4: 最终 Commit**

```bash
git add README.md docs
git commit -m "docs(plan): add implementation and acceptance plan for kimi exporter"
```

### Task 9: 跨环境兼容与 lint 收敛（审查补充）

**Files:**
- Modify: `extension/content/dom-adapter.js`
- Modify: `eslint.config.mjs`
- Verify: `tests/dom-adapter.test.mjs`

**Step 1: 复现失败（先红）**

Run: `node --test tests/dom-adapter.test.mjs`
Expected: FAIL with `ReferenceError: Element is not defined`（Node/JSDOM 环境）。

**Step 2: 修复 DOM 适配层跨环境判定**

- 将 `instanceof Element/HTMLElement` 改为 `nodeType === 1` 的通用判定。
- 将 `Node.DOCUMENT_POSITION_*` 常量改为数值位掩码，避免依赖浏览器全局。

**Step 3: 收敛 lint 规则**

- 在 `eslint.config.mjs` 增加 `AbortController / clearTimeout / Element / HTMLElement / Node` 全局。
- `no-unused-vars` 增加 `caughtErrorsIgnorePattern: "^_"`。

**Step 4: 验证**

Run:
1. `node --test tests/dom-adapter.test.mjs`
2. `npm run lint`
3. `node --test tests/*.test.mjs`

Expected:
- dom-adapter 测试通过。
- lint 无错误。
- 全量测试通过。
