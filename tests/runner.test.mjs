// [Input] content runner 源码与最小 chrome mock。
// [Output] 重复注入同一内容脚本时不抛语法错误的断言。
// [Pos] 内容脚本注入安全回归测试。
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("runner source can be evaluated twice without redeclaration error", () => {
  const source = fs.readFileSync("extension/content/runner.js", "utf8");
  const listeners = [];
  const context = vm.createContext({
    globalThis: {},
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          }
        },
        getURL(path) {
          return `chrome-extension://test/${path}`;
        }
      }
    }
  });

  assert.doesNotThrow(() => vm.runInContext(source, context));
  assert.doesNotThrow(() => vm.runInContext(source, context));
  assert.equal(listeners.length, 1);
});
