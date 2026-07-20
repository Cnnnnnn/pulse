/**
 * tests/main/preload-api-contract.test.js
 *
 * Contract test: preload.js `contextBridge.exposeInMainWorld("api", { ... })` 暴露的
 * key 集合, 必须覆盖 src/renderer/api.js 里 createApi() 的所有顶层 IPC key (除嵌套的
 * releaseNotes).
 *
 * 触发过的回归: 2026-06-28 「检查更新」按钮无反应 — preload.js 漏写了
 * versionsRunCheck bridge, api.js 的 pick() 静默 fallback 到 noop, 用户点击无报错
 * 无提示, 调试靠肉眼比对两文件.
 *
 * ponytail: 解析 preload.js 源码而非 require() 它 — preload 顶层就调 electron API,
 *         vi.mock("electron") 对 CJS require 路径不稳, 而 preload 的 IPC bridge 表面
 *         是纯字面量对象, 解析源码更可靠, 加载也快 (零 side-effect).
 *
 *         只测"preload 覆盖 api.js", 不测反向. preload 多出来的 key 是 feature
 *         store (wechat-hot / ithome / worldcup / share-card) 通过
 *         `requireApiMethod` 或 `window.api.xxx` 直接消费, 故意绕过 api.js
 *         wrapper 的设计 — 让 feature store 在 api.js 加载失败时也能 graceful
 *         degrade. 这种情况在 api.js 那边加 wrapper 是死代码, 留着不动. 真死
 *         代码 (例: 2026-06-28 删的 getAiKey — preload 暴露但 main handler 没注册,
 *         renderer 也没调) 应该在 review 时识别 + 删.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD_PATH = path.resolve(__dirname, "../../preload.js");

/**
 * 从 preload.js 提取 exposeInMainWorld("api", { ... }) 第二参的所有顶层 key.
 *
 * 解析规则: 找到 `exposeInMainWorld("api", {` 起始, 大括号配对扫描到对应的 `},` 结束
 * (顶层 namespace 一定是 `,` 或文件末尾), 截取中间源码. 顶层 key 形如 `  foo: ...` (2
 * 空格缩进). 嵌套对象 (e.g. releaseNotes: { getCurrent, ... }) 整体算 1 个 key,
 * 内部 4 空格的子 key 不计.
 *
 * 注: 没找到匹配 namespace 时 throw, 让测试明确 fail 而不是返回空集.
 */
function extractApiKeysFromPreload(src) {
  const start = src.indexOf('exposeInMainWorld("api", {');
  if (start < 0) {
    throw new Error('preload.js missing exposeInMainWorld("api", { ... })');
  }
  // 从 `{` 之后开始配对扫描.
  let i = start + 'exposeInMainWorld("api", '.length;
  // i 现在指向 `{`.
  if (src[i] !== "{") {
    throw new Error(
      `expected '{' at offset ${i}, got ${JSON.stringify(src[i])}`,
    );
  }
  let depth = 0;
  const objStart = i + 1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const body = src.slice(objStart, i);
        return parseTopLevelKeys(body);
      }
    }
  }
  throw new Error("exposeInMainWorld api block never closed");
}

/** 从对象字面量源码里抽取顶层 key. `  name:` 算, `    name:` 嵌套不算. */
function parseTopLevelKeys(body) {
  const keys = [];
  const re = /^ {2}([a-zA-Z_$][\w$]*)\s*:/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    keys.push(m[1]);
  }
  return [...new Set(keys)]; // 去重
}

/** 读 preload.js 源码并解析 api namespace 的顶层 key. */
function preloadApiKeys() {
  const src = readFileSync(PRELOAD_PATH, "utf8");
  return extractApiKeysFromPreload(src);
}

/** 通过 dynamic import 拿 createApi() 的真实顶层 key (renderer ESM). */
async function rendererApiKeys() {
  const mod = await import("../../src/renderer/api.js");
  return Object.keys(mod.createApi());
}

describe("preload.js ↔ api.js IPC surface contract", () => {
  it("preload 暴露的 api.* 覆盖 createApi() 的所有顶层 key", async () => {
    const preloadKeys = preloadApiKeys();
    expect(preloadKeys.length).toBeGreaterThan(0);

    const apiKeys = await rendererApiKeys();
    // releaseNotes 在两端都是嵌套子对象, 顶层对比时按同名跳过.
    const missing = apiKeys.filter(
      (k) => k !== "releaseNotes" && !preloadKeys.includes(k),
    );
    expect(
      missing,
      `preload.js 缺这些 IPC bridge (renderer api.js 调了但没暴露):\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        `\n\n修复: 在 preload.js 的 contextBridge.exposeInMainWorld("api", { ... }) 里补上对应 key.`,
    ).toEqual([]);
  });
});
