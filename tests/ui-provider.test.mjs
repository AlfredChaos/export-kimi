// [Input] UIProvider的模拟DOMAdapter行为。
// [Output] UI遍历成功/失败聚合的结果断言。
// [Pos] UI回退数据源单元测试。
import assert from "node:assert/strict";
import test from "node:test";

import { UIProvider } from "../extension/core/ui-provider.js";

test("ui provider aggregates conversations and failures", async () => {
  const fakeEntries = [
    { key: "chat-1", title: "会话一", element: {} },
    { key: "chat-2", title: "会话二", element: {} }
  ];

  const opened = [];
  let current = "";

  const provider = new UIProvider({
    windowObj: { document: {} },
    adapterFactory: () => ({
      findHistorySidebar: () => ({ id: "sidebar" }),
      expandHistoryList: async () => {},
      collectConversationEntries: () => fakeEntries,
      openConversation: async (entry) => {
        opened.push(entry.key);
        current = entry.key;
      },
      extractCurrentConversation: (fallbackTitle) => {
        if (current === "chat-2") {
          return { title: fallbackTitle, messages: [] };
        }
        return { title: fallbackTitle, messages: [{ role: "user", text: "hi" }] };
      }
    })
  });

  const result = await provider.collectAll();
  assert.equal(result.conversations.length, 1);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(opened, ["chat-1", "chat-2"]);
});
