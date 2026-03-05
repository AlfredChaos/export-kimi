// [Input] 多个导出文件名与文本内容。
// [Output] ZIP二进制头与目录元数据断言。
// [Pos] 压缩打包层单元测试。
import assert from "node:assert/strict";
import test from "node:test";

import { createZipBytes } from "../extension/core/zip.js";

test("create zip bytes with PK header", () => {
  const bytes = createZipBytes([
    { name: "one.md", content: "# one" },
    { name: "two.md", content: "# two" }
  ]);

  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);

  const decoded = new TextDecoder().decode(bytes);
  assert.match(decoded, /one\.md/);
  assert.match(decoded, /two\.md/);
});
