// [Input] APIProvider的模拟接口响应与原始JSON结构。
// [Output] 会话/消息抽取与API采集路径断言。
// [Pos] API数据源单元测试。
import assert from "node:assert/strict";
import test from "node:test";

import { APIProvider, buildDefaultHeaders, extractChatMetas, extractMessages } from "../extension/core/api-provider.js";

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

test("buildDefaultHeaders includes Authorization from refresh_token", () => {
  const mockWindow = {
    navigator: { language: "zh-CN" },
    localStorage: createMockStorage({ refresh_token: "eyJhbGciOiJIUzI1NiJ9.test" })
  };

  const headers = buildDefaultHeaders(mockWindow);
  assert.equal(headers["authorization"], "Bearer eyJhbGciOiJIUzI1NiJ9.test");
});

test("buildDefaultHeaders prefers access_token over refresh_token", () => {
  const mockWindow = {
    navigator: { language: "zh-CN" },
    localStorage: createMockStorage({
      access_token: "access-abc",
      refresh_token: "refresh-xyz"
    })
  };

  const headers = buildDefaultHeaders(mockWindow);
  assert.equal(headers["authorization"], "Bearer access-abc");
});

test("buildDefaultHeaders handles JSON array token format", () => {
  const mockWindow = {
    navigator: { language: "zh-CN" },
    localStorage: createMockStorage({
      refresh_token: '["part1","part2","part3"]'
    })
  };

  const headers = buildDefaultHeaders(mockWindow);
  assert.equal(headers["authorization"], "Bearer part1.part2.part3");
});

test("buildDefaultHeaders omits Authorization when no token found", () => {
  const mockWindow = {
    navigator: { language: "zh-CN" },
    localStorage: createMockStorage({ device_id: "dev123" })
  };

  const headers = buildDefaultHeaders(mockWindow);
  assert.equal(headers["authorization"], undefined);
});

test("api provider sends Authorization header in requests", async () => {
  let capturedHeaders = null;

  const fetchImpl = async (_url, options) => {
    capturedHeaders = options.headers;
    return createResponse({ data: { chats: [{ chat_id: "c1", title: "测试" }] } });
  };

  const mockWindow = {
    fetch: fetchImpl,
    navigator: { language: "zh-CN" },
    localStorage: createMockStorage({ refresh_token: "test-token" })
  };

  const provider = new APIProvider({ windowObj: mockWindow, fetchImpl });

  try {
    await provider.collectAll();
  } catch (_error) {
    // collectAll 可能因后续请求失败而抛错，这里只关心 header
  }

  assert.equal(capturedHeaders["authorization"], "Bearer test-token");
});

function createMockStorage(data) {
  const entries = Object.entries(data);
  return {
    length: entries.length,
    key(index) {
      return entries[index]?.[0] ?? null;
    },
    getItem(key) {
      return data[key] ?? null;
    }
  };
}
