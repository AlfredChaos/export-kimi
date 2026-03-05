// [Input] 扩展基础配置文件路径。
// [Output] 对MV3最小可用结构的回归校验。
// [Pos] 项目级冒烟测试入口。
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("manifest exists and defines MV3 + content runner", () => {
  const raw = fs.readFileSync("extension/manifest.json", "utf8");
  const manifest = JSON.parse(raw);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.ok(Array.isArray(manifest.content_scripts));
  assert.ok(manifest.content_scripts[0].js.includes("content/runner.js"));
});
