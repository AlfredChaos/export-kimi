// [Input] 静态HTML夹具与DOMAdapter实例。
// [Output] 会话入口识别与消息提取行为断言。
// [Pos] 页面结构适配层单元测试。
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { JSDOM } from "jsdom";
import { DOMAdapter } from "../extension/content/dom-adapter.js";

function loadFixture() {
  const html = fs.readFileSync("tests/fixtures/chat-page.html", "utf8");
  const dom = new JSDOM(html, { url: "https://www.kimi.com/" });
  return dom.window.document;
}

test("find sidebar and collect conversation entries", () => {
  const documentObj = loadFixture();
  const adapter = new DOMAdapter(documentObj);

  const sidebar = adapter.findHistorySidebar();
  assert.ok(sidebar);

  const entries = adapter.collectConversationEntries(sidebar);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, "方案讨论");
  assert.equal(entries[1].title, "发布计划");
  assert.equal(entries[0].id, "19be9f88-c422-8f69-8000-0969abfc6911");
  assert.equal(entries[0].url, "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911");
  assert.equal(entries[1].url, "https://www.kimi.com/chat/29be9f88-c422-8f69-8000-0969abfc6912");
  assert.equal(entries.some((entry) => entry.title === "查看全部"), false);
});

test("find history portal entry and collect full history entries", () => {
  const documentObj = loadFixture();
  const adapter = new DOMAdapter(documentObj);

  const sidebar = adapter.findHistorySidebar();
  assert.ok(sidebar);

  const historyPortalEntry = adapter.findHistoryPortalEntry(sidebar);
  assert.ok(historyPortalEntry);
  assert.equal(historyPortalEntry.title, "查看全部");

  const historyRoot = adapter.findHistoryPortalRoot();
  assert.ok(historyRoot);

  const entries = adapter.collectConversationEntries(historyRoot, { source: "history" });
  assert.deepEqual(
    entries.map((entry) => entry.title),
    ["方案讨论", "发布计划", "远程工作限制"]
  );
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [
      "19be9f88-c422-8f69-8000-0969abfc6911",
      "29be9f88-c422-8f69-8000-0969abfc6912",
      "39be9f88-c422-8f69-8000-0969abfc6913"
    ]
  );
  assert.deepEqual(
    entries.map((entry) => entry.url),
    [
      "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911",
      "https://www.kimi.com/chat/29be9f88-c422-8f69-8000-0969abfc6912",
      "https://www.kimi.com/chat/39be9f88-c422-8f69-8000-0969abfc6913"
    ]
  );
  assert.equal(entries.some((entry) => entry.url.endsWith("/chat/history")), false);
});

test("extract current conversation with role and text", () => {
  const documentObj = loadFixture();
  const adapter = new DOMAdapter(documentObj);

  const conversation = adapter.extractCurrentConversation("fallback");
  assert.equal(conversation.title, "方案讨论");
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.messages[0].role, "user");
  assert.equal(conversation.messages[1].role, "assistant");
});

test("collect conversation refs from history document when list rows are non-interactive", () => {
  const documentObj = new JSDOM(
    `
      <body>
        <main>
          <h1>历史会话</h1>
          <div data-chat-id="19be9f88-c422-8f69-8000-0969abfc6911">方案讨论</div>
          <div>
            <a href="/chat/29be9f88-c422-8f69-8000-0969abfc6912?from=history">发布计划</a>
          </div>
        </main>
      </body>
    `,
    { url: "https://www.kimi.com/chat/history" }
  ).window.document;
  const adapter = new DOMAdapter(documentObj);

  const entries = adapter.collectConversationEntriesFromDocument({ source: "history" });
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [
      "19be9f88-c422-8f69-8000-0969abfc6911",
      "29be9f88-c422-8f69-8000-0969abfc6912"
    ]
  );
  assert.deepEqual(
    entries.map((entry) => entry.url),
    [
      "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911",
      "https://www.kimi.com/chat/29be9f88-c422-8f69-8000-0969abfc6912?from=history"
    ]
  );
});
