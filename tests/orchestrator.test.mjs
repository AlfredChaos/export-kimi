// [Input] 两个Provider（首个失败、第二个成功）的模拟输出。
// [Output] 回退成功、统计值与ZIP文件生成断言。
// [Pos] 方案C编排器单元测试。
import assert from "node:assert/strict";
import test from "node:test";

import { ExportOrchestrator } from "../extension/core/export-orchestrator.js";

class FailingProvider {
  constructor() {
    this.name = "api";
  }

  async collectAll() {
    throw new Error("api unavailable");
  }
}

class SuccessProvider {
  constructor() {
    this.name = "ui";
  }

  async collectAll() {
    return {
      provider: "ui",
      conversations: [
        {
          id: "chat-1",
          title: "回退会话",
          provider: "ui",
          messages: [{ role: "user", text: "hello" }]
        }
      ],
      failures: [{ id: "chat-2", title: "失败会话", reason: "empty" }]
    };
  }
}

test("orchestrator falls back and returns zip bytes", async () => {
  const orchestrator = new ExportOrchestrator({
    providers: [new FailingProvider(), new SuccessProvider()]
  });

  const result = await orchestrator.run();

  assert.equal(result.provider, "ui");
  assert.equal(result.stats.success, 1);
  assert.equal(result.stats.failed, 1);
  assert.equal(result.bytes[0], 0x50);
  assert.equal(result.bytes[1], 0x4b);
  assert.match(result.fileName, /^kimi-history-\d{8}-\d{6}\.zip$/);
});
