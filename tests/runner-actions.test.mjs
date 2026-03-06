// [Input] runner 动作模块与静态 DOM fixture。
// [Output] UI 发现与当前会话提取动作的回归断言。
// [Pos] 内容脚本动作层单元测试。
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { JSDOM } from "jsdom";

import { discoverAllHistoryEntries, extractCurrentConversation } from "../extension/content/runner-actions.js";

function loadFixtureDocument() {
  const html = fs.readFileSync("tests/fixtures/chat-page.html", "utf8");
  return new JSDOM(html, { url: "https://www.kimi.com/" }).window.document;
}

test("discover all history entries returns chat refs from history page", async () => {
  const documentObj = loadFixtureDocument();

  const result = await discoverAllHistoryEntries({ windowObj: { document: documentObj } });

  assert.deepEqual(
    result.entries.map((entry) => entry.id),
    [
      "19be9f88-c422-8f69-8000-0969abfc6911",
      "29be9f88-c422-8f69-8000-0969abfc6912",
      "39be9f88-c422-8f69-8000-0969abfc6913"
    ]
  );
  assert.equal(result.failures.length, 0);
});

test("discover all history entries falls back to document-wide ref scan", async () => {
  const documentObj = new JSDOM(
    `
      <body>
        <main>
          <a href="/chat/19be9f88-c422-8f69-8000-0969abfc6911?from=history">方案讨论</a>
          <div data-chat-id="29be9f88-c422-8f69-8000-0969abfc6912">发布计划</div>
        </main>
      </body>
    `,
    { url: "https://www.kimi.com/chat/history" }
  ).window.document;

  const result = await discoverAllHistoryEntries({ windowObj: { document: documentObj } });

  assert.deepEqual(
    result.entries.map((entry) => entry.id),
    [
      "19be9f88-c422-8f69-8000-0969abfc6911",
      "29be9f88-c422-8f69-8000-0969abfc6912"
    ]
  );
});

test("extract current conversation returns normalized chat payload", async () => {
  const documentObj = loadFixtureDocument();

  const result = await extractCurrentConversation({
    windowObj: { document: documentObj },
    fallbackTitle: "fallback"
  });

  assert.equal(result.title, "方案讨论");
  assert.equal(result.messages.length, 2);
});

test("extract current conversation waits for async rendered messages", async () => {
  let attempts = 0;

  const result = await extractCurrentConversation({
    windowObj: { document: {} },
    fallbackTitle: "fallback",
    adapterFactory: () => ({
      extractCurrentConversation: () => {
        attempts += 1;
        if (attempts < 3) {
          return { title: "fallback", messages: [] };
        }

        return {
          title: "异步会话",
          messages: [{ role: "user", text: "ready" }]
        };
      }
    })
  });

  assert.equal(result.title, "异步会话");
  assert.equal(result.messages.length, 1);
  assert.equal(attempts, 3);
});
