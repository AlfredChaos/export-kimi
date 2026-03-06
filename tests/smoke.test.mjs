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
  assert.equal(manifest.background.type, "module");
  assert.ok(Array.isArray(manifest.content_scripts));
  assert.ok(manifest.content_scripts[0].js.includes("content/runner.js"));
});

test("manifest exposes dynamic import modules for content runner", () => {
  const raw = fs.readFileSync("extension/manifest.json", "utf8");
  const manifest = JSON.parse(raw);

  assert.ok(Array.isArray(manifest.web_accessible_resources), "web_accessible_resources must be configured");
  const kimiRule = manifest.web_accessible_resources.find((entry) =>
    Array.isArray(entry?.matches) && entry.matches.includes("https://www.kimi.com/*")
  );

  assert.ok(kimiRule, "web_accessible_resources must allow kimi.com");
  assert.ok(Array.isArray(kimiRule.resources), "resources must be defined for kimi.com");
  assert.ok(kimiRule.resources.includes("core/*.js"), "core modules must be web accessible");
  assert.ok(
    kimiRule.resources.includes("content/dom-adapter.js") || kimiRule.resources.includes("content/*.js"),
    "content modules must be web accessible"
  );
  assert.ok(
    kimiRule.resources.includes("content/runner-actions.js") || kimiRule.resources.includes("content/*.js"),
    "runner actions module must be web accessible"
  );
});

test("runner defines api/discovery/extract message types", () => {
  const source = fs.readFileSync("extension/content/runner.js", "utf8");

  assert.match(source, /KIMI_EXPORT_API_ONLY/);
  assert.match(source, /KIMI_DISCOVER_ALL_HISTORY_ENTRIES/);
  assert.match(source, /KIMI_EXTRACT_CURRENT_CHAT/);
});
