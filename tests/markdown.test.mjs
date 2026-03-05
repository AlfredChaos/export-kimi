// [Input] 标准化会话对象样例。
// [Output] Markdown序列化结构断言结果。
// [Pos] 文本导出规则单元测试。
import assert from "node:assert/strict";
import test from "node:test";

import { toMarkdown } from "../extension/core/markdown.js";

test("serialize conversation to markdown", () => {
  const markdown = toMarkdown({
    id: "chat-1",
    title: "测试会话",
    provider: "ui",
    exportedAt: "2026-03-06T00:00:00.000Z",
    messages: [
      { role: "user", text: "你好" },
      { role: "assistant", text: "```js\nconsole.log(1)\n```" }
    ]
  });

  assert.match(markdown, /^# 测试会话/m);
  assert.match(markdown, /## USER/m);
  assert.match(markdown, /## ASSISTANT/m);
  assert.match(markdown, /ConversationId: chat-1/m);
});
