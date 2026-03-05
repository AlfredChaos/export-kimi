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
