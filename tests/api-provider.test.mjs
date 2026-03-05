// [Input] APIProvider的模拟接口响应与原始JSON结构。
// [Output] 会话/消息抽取与API采集路径断言。
// [Pos] API数据源单元测试。
import assert from "node:assert/strict";
import test from "node:test";

import { APIProvider, extractChatMetas, extractMessages } from "../extension/core/api-provider.js";

function createResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test("extract chat metadata and messages from nested payload", () => {
  const chatPayload = { data: { chats: [{ chat_id: "c1", title: "设计评审" }] } };
  const messagePayload = {
    data: {
      messages: [
        { role: "user", text: "你好" },
        { role: "assistant", content: [{ text: "已收到" }] }
      ]
    }
  };

  const chats = extractChatMetas(chatPayload);
  const messages = extractMessages(messagePayload);

  assert.equal(chats.length, 1);
  assert.equal(chats[0].id, "c1");
  assert.equal(messages.length, 2);
  assert.equal(messages[1].text, "已收到");
});

test("api provider collects conversations with mocked fetch", async () => {
  const calls = [];

  const fetchImpl = async (url) => {
    calls.push(url);

    if (url.endsWith("/ListChats")) {
      return createResponse({ data: { chats: [{ chat_id: "c1", title: "会话A" }] } });
    }

    if (url.endsWith("/ListMessages")) {
      return createResponse({
        data: {
          messages: [
            { role: "user", text: "Hi" },
            { role: "assistant", text: "Hello" }
          ]
        }
      });
    }

    return createResponse({ code: "not_found" }, 404);
  };

  const provider = new APIProvider({
    windowObj: {
      fetch: fetchImpl,
      navigator: { language: "zh-CN" },
      localStorage: null
    },
    fetchImpl
  });

  const result = await provider.collectAll();
  assert.equal(result.provider, "api");
  assert.equal(result.conversations.length, 1);
  assert.equal(result.conversations[0].messages.length, 2);
  assert.ok(calls.some((url) => url.endsWith("/ListChats")));
});
