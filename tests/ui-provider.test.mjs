// [Input] UIProvider 的 driver mock 与会话引用样本。
// [Output] 工作标签页 UI 编排的聚合、去重与失败回退断言。
// [Pos] UIProvider 回退链路单元测试。
import assert from "node:assert/strict";
import test from "node:test";

import { UIProvider } from "../extension/core/ui-provider.js";

test("ui provider merges recent/history refs and loads conversations by target url", async () => {
  const loadedUrls = [];
  const progressEvents = [];

  const provider = new UIProvider({
    windowObj: { document: {} },
    driver: {
      discoverRecentEntries: async () => [
        {
          id: "19be9f88-c422-8f69-8000-0969abfc6911",
          title: "方案讨论",
          url: "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911"
        }
      ],
      discoverHistoryEntries: async () => [
        {
          id: "19be9f88-c422-8f69-8000-0969abfc6911",
          title: "方案讨论",
          url: "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911"
        },
        {
          id: "29be9f88-c422-8f69-8000-0969abfc6912",
          title: "发布计划",
          url: "https://www.kimi.com/chat/29be9f88-c422-8f69-8000-0969abfc6912"
        },
        {
          id: "39be9f88-c422-8f69-8000-0969abfc6913",
          title: "远程工作限制",
          url: "https://www.kimi.com/chat/39be9f88-c422-8f69-8000-0969abfc6913"
        }
      ],
      loadConversation: async (entry) => {
        loadedUrls.push(entry.url);
        if (entry.id === "39be9f88-c422-8f69-8000-0969abfc6913") {
          throw new Error("Page extraction failed");
        }

        return {
          id: entry.id,
          title: entry.title,
          messages: [{ role: "user", text: `message:${entry.id}` }]
        };
      }
    }
  });

  const result = await provider.collectAll((progress) => {
    progressEvents.push(progress);
  });

  assert.deepEqual(
    result.conversations.map((conversation) => conversation.id),
    ["19be9f88-c422-8f69-8000-0969abfc6911", "29be9f88-c422-8f69-8000-0969abfc6912"]
  );
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].id, "39be9f88-c422-8f69-8000-0969abfc6913");
  assert.deepEqual(loadedUrls, [
    "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911",
    "https://www.kimi.com/chat/29be9f88-c422-8f69-8000-0969abfc6912",
    "https://www.kimi.com/chat/39be9f88-c422-8f69-8000-0969abfc6913"
  ]);
  assert.equal(progressEvents.length, 3);
});

test("ui provider keeps recent refs when history discovery fails", async () => {
  const provider = new UIProvider({
    windowObj: { document: {} },
    driver: {
      discoverRecentEntries: async () => [
        {
          id: "19be9f88-c422-8f69-8000-0969abfc6911",
          title: "方案讨论",
          url: "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911"
        }
      ],
      discoverHistoryEntries: async () => {
        throw new Error("History discovery failed");
      },
      loadConversation: async (entry) => ({
        id: entry.id,
        title: entry.title,
        messages: [{ role: "user", text: `message:${entry.id}` }]
      })
    }
  });

  const result = await provider.collectAll();
  assert.equal(result.conversations.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].id, "history-discovery");
  assert.match(result.failures[0].reason, /History discovery failed/);
});

test("ui provider fails when no conversation refs can be discovered", async () => {
  const provider = new UIProvider({
    windowObj: { document: {} },
    driver: {
      discoverRecentEntries: async () => [],
      discoverHistoryEntries: async () => []
    }
  });

  await assert.rejects(
    provider.collectAll(),
    /No conversation entries discovered from UI fallback/
  );
});
