// [Input] 工作标签页导出协调器与模拟 chrome API。
// [Output] UI 回退发现、逐页提取、下载与清理断言。
// [Pos] 后台工作标签页导出链路单元测试。
import assert from "node:assert/strict";
import test from "node:test";

import { exportViaWorkerTabUI } from "../extension/core/worker-tab-export.js";

test("worker tab exporter discovers refs, loads each chat url and triggers download", async () => {
  const createdTabs = [];
  const updatedUrls = [];
  const removedTabIds = [];
  const downloads = [];
  const workerExtractionTabIds = [];

  const chromeApi = {
    tabs: {
      sendMessage: async (tabId, payload) => {
        if (tabId === 301 && payload.type === "KIMI_DISCOVER_ALL_HISTORY_ENTRIES") {
          return {
            ok: true,
            entries: [
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
              },
              {
                id: "49be9f88-c422-8f69-8000-0969abfc6914",
                title: "会话四",
                url: "https://www.kimi.com/chat/49be9f88-c422-8f69-8000-0969abfc6914"
              },
              {
                id: "59be9f88-c422-8f69-8000-0969abfc6915",
                title: "会话五",
                url: "https://www.kimi.com/chat/59be9f88-c422-8f69-8000-0969abfc6915"
              },
              {
                id: "69be9f88-c422-8f69-8000-0969abfc6916",
                title: "会话六",
                url: "https://www.kimi.com/chat/69be9f88-c422-8f69-8000-0969abfc6916"
              },
              {
                id: "79be9f88-c422-8f69-8000-0969abfc6917",
                title: "会话七",
                url: "https://www.kimi.com/chat/79be9f88-c422-8f69-8000-0969abfc6917"
              }
            ],
            failures: []
          };
        }

        if (payload.type === "KIMI_EXTRACT_CURRENT_CHAT") {
          workerExtractionTabIds.push(tabId);
          if (payload.entry.id === "29be9f88-c422-8f69-8000-0969abfc6912") {
            throw new Error("Extraction failed");
          }

          return {
            ok: true,
            conversation: {
              title: payload.entry.title,
              messages: [{ role: "user", text: `message:${payload.entry.id}` }]
            }
          };
        }

        throw new Error(`Unexpected sendMessage: ${tabId}:${payload.type}`);
      },
      create: async ({ url, active }) => {
        assert.equal(active, false);
        createdTabs.push(url);
        return { id: 300 + createdTabs.length };
      },
      update: async (tabId, { url, active }) => {
        updatedUrls.push({ tabId, url, active });
        return { id: tabId, status: "complete" };
      },
      get: async (tabId) => ({ id: tabId, status: "complete" }),
      remove: async (tabId) => {
        removedTabIds.push(tabId);
      }
    },
    downloads: {
      download: async (payload) => {
        downloads.push(payload);
        return 303;
      }
    },
    scripting: {
      executeScript: async () => {}
    }
  };

  const result = await exportViaWorkerTabUI({
    chromeApi,
    activeTab: {
      id: 101,
      url: "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911"
    },
    workerConcurrency: 5
  });

  assert.equal(result.provider, "ui");
  assert.equal(result.stats.success, 6);
  assert.equal(result.stats.failed, 1);
  assert.equal(result.downloadId, 303);
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].url, /^data:application\/zip;base64,/);
  assert.deepEqual(createdTabs, [
    "https://www.kimi.com/chat/history",
    "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911",
    "https://www.kimi.com/chat/29be9f88-c422-8f69-8000-0969abfc6912",
    "https://www.kimi.com/chat/39be9f88-c422-8f69-8000-0969abfc6913",
    "https://www.kimi.com/chat/49be9f88-c422-8f69-8000-0969abfc6914",
    "https://www.kimi.com/chat/59be9f88-c422-8f69-8000-0969abfc6915"
  ]);
  assert.equal(updatedUrls.length, 7);
  assert.equal(new Set(workerExtractionTabIds).size, 5);
  assert.deepEqual(removedTabIds.sort((a, b) => a - b), [301, 302, 303, 304, 305, 306]);
});

test("worker tab exporter tolerates long loading tabs when document is already interactive", async () => {
  const executeScriptCalls = [];
  let createCount = 0;
  const chromeApi = {
    tabs: {
      sendMessage: async (tabId, payload) => {
        if (tabId === 401 && payload.type === "KIMI_DISCOVER_ALL_HISTORY_ENTRIES") {
          return {
            ok: true,
            entries: [
              {
                id: "19be9f88-c422-8f69-8000-0969abfc6911",
                title: "方案讨论",
                url: "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911"
              }
            ],
            failures: []
          };
        }

        if (tabId === 402 && payload.type === "KIMI_EXTRACT_CURRENT_CHAT") {
          return {
            ok: true,
            conversation: {
              title: payload.entry.title,
              messages: [{ role: "user", text: "ok" }]
            }
          };
        }

        throw new Error(`Unexpected sendMessage: ${tabId}:${payload.type}`);
      },
      create: async ({ active }) => {
        assert.equal(active, false);
        createCount += 1;
        if (createCount === 1) {
          return { id: 401 };
        }
        return { id: 402 };
      },
      update: async (tabId, { url }) => ({ id: tabId, status: "loading", url }),
      get: async (tabId) => {
        if (tabId === 401) {
          return { id: tabId, status: "complete" };
        }
        return { id: tabId, status: "loading" };
      },
      remove: async () => {}
    },
    downloads: {
      download: async () => 501
    },
    scripting: {
      executeScript: async (payload) => {
        executeScriptCalls.push(payload);
        if (typeof payload.func === "function") {
          return [{ result: "interactive" }];
        }
        return [];
      }
    }
  };

  const result = await exportViaWorkerTabUI({
    chromeApi,
    activeTab: {
      id: 111,
      url: "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911"
    },
    workerConcurrency: 1
  });

  assert.equal(result.provider, "ui");
  assert.equal(result.stats.success, 1);
  assert.ok(executeScriptCalls.some((call) => typeof call.func === "function"));
});

test("worker tab exporter records tab-wait failure per entry instead of aborting whole run", async () => {
  const tabUrlById = new Map();
  let createCount = 0;

  const chromeApi = {
    tabs: {
      sendMessage: async (tabId, payload) => {
        if (tabId === 601 && payload.type === "KIMI_DISCOVER_ALL_HISTORY_ENTRIES") {
          return {
            ok: true,
            entries: [
              {
                id: "19be9f88-c422-8f69-8000-0969abfc6911",
                title: "会话一",
                url: "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911"
              },
              {
                id: "29be9f88-c422-8f69-8000-0969abfc6912",
                title: "会话二",
                url: "https://www.kimi.com/chat/29be9f88-c422-8f69-8000-0969abfc6912"
              }
            ],
            failures: []
          };
        }

        if (tabId === 602 && payload.type === "KIMI_EXTRACT_CURRENT_CHAT") {
          return {
            ok: true,
            conversation: {
              title: payload.entry.title,
              messages: [{ role: "assistant", text: `ok:${payload.entry.id}` }]
            }
          };
        }

        throw new Error(`Unexpected sendMessage: ${tabId}:${payload.type}`);
      },
      create: async ({ url, active }) => {
        assert.equal(active, false);
        createCount += 1;
        const id = createCount === 1 ? 601 : 602;
        tabUrlById.set(id, url);
        return { id };
      },
      update: async (tabId, { url, active }) => {
        assert.equal(active, false);
        tabUrlById.set(tabId, url);
        return { id: tabId, status: "loading", url };
      },
      get: async (tabId) => {
        if (tabId === 601) {
          return { id: tabId, status: "complete" };
        }

        const currentUrl = tabUrlById.get(tabId) || "";
        if (currentUrl.includes("19be9f88-c422-8f69-8000-0969abfc6911")) {
          throw new Error("Tab crashed while loading");
        }

        return { id: tabId, status: "complete" };
      },
      remove: async () => {}
    },
    downloads: {
      download: async () => 701
    },
    scripting: {
      executeScript: async () => []
    }
  };

  const result = await exportViaWorkerTabUI({
    chromeApi,
    activeTab: {
      id: 121,
      url: "https://www.kimi.com/chat/19be9f88-c422-8f69-8000-0969abfc6911"
    },
    workerConcurrency: 1
  });

  assert.equal(result.provider, "ui");
  assert.equal(result.stats.success, 1);
  assert.equal(result.stats.failed, 1);
});
