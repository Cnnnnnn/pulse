/**
 * tests/main/preload-api-contract.test.js
 *
 * Contract test: dist/preload.js (esbuild 从 preload.ts 编译的 CommonJS bundle)
 * 通过 contextBridge.exposeInMainWorld 暴露的 namespace, 必须满足:
 *
 *   1. 暴露四个 namespace: api / pulse / metalsApi / platformInfo
 *   2. api namespace 的顶层 key 覆盖 src/renderer/api.js createApi() 的所有
 *      顶层 IPC key (除嵌套的 releaseNotes — 那一项 preload/api.js 同样嵌套
 *      处理, 顶层对比按同名跳过)
 *
 * 触发过的回归: 2026-06-28 「检查更新」按钮无反应 — preload 漏写了
 * versionsRunCheck bridge, api.js 的 pick() 静默 fallback 到 noop, 用户点击
 * 无报错无提示, 调试靠肉眼比对两文件.
 *
 * ponytail: 复用 tests/preload-platform.test.js 的 require.cache stub 模式
 *         (electron 包有自定义 interop, vi.mock("electron") 拦不住, 注入
 *         stub 模块到 require.cache 是仓库已有做法). 真实 require dist/preload.js
 *         让 esbuild CJS bundle 走完整路径 (TS → JS bundle), 通过 stub 捕获
 *         exposeInMainWorld 调用, 比解析 esbuild 私有缩进格式稳 — 升级路径:
 *         升级 esbuild 大版本 (可能改缩进/字段) 时, 现有 source-parse 测试会
 *         默默变 false-positive, 真执行只查 stub.exposed, 不依赖源码格式.
 *
 *         只测 "preload 覆盖 api.js" (正向), 不测反向: preload 多出来的 key
 *         是 feature store (wechat-hot / ithome / worldcup / share-card) 通过
 *         requireApiMethod 或 window.api.xxx 直接消费, 故意绕过 api.js wrapper
 *         的设计 — 让 feature store 在 api.js 加载失败时也能 graceful degrade.
 *         真死代码 (例: 2026-06-28 删的 getAiKey — preload 暴露但 main handler
 *         没注册, renderer 也没调) 应在 review 时识别 + 删, 不靠本测试.
 *
 * 干净 checkout 自包含: beforeAll 检测 dist/preload.js, 缺失时用 esbuild
 * api.buildSync 同步构建 (esbuild 已是 devDependency, 不引入新依赖). 覆盖
 *   - npm test (pretest 钩子先跑, beforeAll 看到 dist 已存在 → 跳过)
 *   - pnpm exec vitest --run (CI direct vitest, pretest 不触发, beforeAll 兜底)
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRELOAD_PATH = path.resolve(__dirname, "../../dist/preload.js");

/** 干净 checkout 兜底: dist/preload.js 不存在就同步构建一次. */
function ensurePreloadBuilt() {
  if (existsSync(PRELOAD_PATH)) return;
  // ponytail: esbuild 是 devDependency (package.json devDependencies),
  // 这里不引入新依赖. Node CJS 同步 build, ~10ms 一次.
  const require = createRequire(path.resolve(__dirname, "../../package.json"));
  const esbuild = require("esbuild");
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, "../../preload.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    outfile: PRELOAD_PATH,
    target: "es2020",
    logLevel: "silent",
  });
}

/** 收集每次 stub.exposeInMainWorld 调用的 (name, value) 快照. */
function makeStubElectron() {
  const exposed = new Map();
  const stub = {
    contextBridge: {
      exposeInMainWorld: (name, value) => {
        exposed.set(name, value);
      },
    },
    ipcRenderer: { invoke: () => {}, on: () => {}, send: () => {}, removeListener: () => {} },
  };
  return { stub, exposed };
}

let electronStubEntry = null;
let preloadCacheKey = null;

function injectElectronStub({ stub }) {
  const electronPath = createRequire(import.meta.url).resolve("electron");
  electronStubEntry = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: stub,
    children: [],
    paths: [],
  };
  require.cache[electronPath] = electronStubEntry;
}

function clearElectronStub() {
  if (electronStubEntry) {
    delete require.cache[electronStubEntry.filename];
    electronStubEntry = null;
  }
  if (preloadCacheKey) {
    delete require.cache[preloadCacheKey];
    preloadCacheKey = null;
  }
}

function requirePreloadFresh() {
  // 用 node:module createRequire 拿 CJS require, 不影响 ESM 测试本身的 import 链.
  const cjsRequire = createRequire(import.meta.url);
  preloadCacheKey = cjsRequire.resolve(PRELOAD_PATH);
  // 防御: 之前测试可能把 preload 缓存了 (尤其 preload-platform.test.js),
  // 重新载入前清掉 — 干净 load 一次, 跑完即清.
  delete cjsRequire.cache[preloadCacheKey];
  cjsRequire(PRELOAD_PATH);
  return preloadCacheKey;
}

beforeAll(() => {
  ensurePreloadBuilt();
});

describe("dist/preload.js ↔ api.js IPC surface contract", () => {
  let exposed;

  beforeEach(() => {
    const m = makeStubElectron();
    exposed = m.exposed;
    injectElectronStub({ stub: m.stub });
  });

  afterEach(() => {
    clearElectronStub();
    exposed = null;
  });

  it("exposes the four required contextBridge namespaces", () => {
    requirePreloadFresh();
    for (const name of ["api", "pulse", "metalsApi", "platformInfo"]) {
      expect(
        exposed.has(name),
        `dist/preload.js 漏 exposeInMainWorld("${name}", ...). 修复: 在 preload.ts 末尾补 contextBridge.exposeInMainWorld("${name}", ${name}).`,
      ).toBe(true);
    }
  });

  it('platformInfo 暴露的是 { platform: process.platform }', () => {
    requirePreloadFresh();
    const info = exposed.get("platformInfo");
    expect(info).toBeDefined();
    expect(typeof info.platform).toBe("string");
    expect(info.platform).toBe(process.platform);
  });

  it("api namespace 的 key 覆盖 createApi() 的所有顶层 IPC (除 releaseNotes 嵌套)", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    expect(api, "dist/preload.js 未暴露 api namespace").toBeDefined();
    const preloadKeys = Object.keys(api);
    expect(preloadKeys.length).toBeGreaterThan(0);

    const mod = await import("../../src/renderer/api.js");
    const apiKeys = Object.keys(mod.createApi());
    // releaseNotes 在两端都是嵌套子对象, 顶层对比时按同名跳过.
    const missing = apiKeys.filter(
      (k) => k !== "releaseNotes" && !preloadKeys.includes(k),
    );
    expect(
      missing,
      `dist/preload.js 缺这些 IPC bridge (renderer api.js 调了但没暴露):\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        `\n\n修复: 在 preload.ts 的 api 对象里补上对应 key.`,
    ).toEqual([]);
  });

  it("pulse / metalsApi 是非空对象 namespace", () => {
    requirePreloadFresh();
    expect(typeof exposed.get("pulse")).toBe("object");
    expect(Object.keys(exposed.get("pulse")).length).toBeGreaterThan(0);
    expect(typeof exposed.get("metalsApi")).toBe("object");
    expect(Object.keys(exposed.get("metalsApi")).length).toBeGreaterThan(0);
  });
});
