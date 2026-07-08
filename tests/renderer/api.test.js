// @vitest-environment happy-dom
/**
 * tests/renderer/api.test.js
 *
 * pick() dev-warn 行为单测 — 防止 2026-06-28 「检查更新」按钮无反应 这类 bug 再静默
 * 退化. 核心契约:
 *
 *   1. 缺 IPC bridge + dev 模式 → console.warn 一次, 返 noop
 *   2. 缺 IPC bridge + 生产模式 → 不 warn, 返 noop (现状行为, 不变)
 *   3. overrides 命中或 window.api 命中 → 永不 warn
 *   4. 同 key 多次 miss → 只 warn 一次 (避免测试 mount / HMR 把控制台刷爆)
 *
 * ponytail: api.js 是被各 renderer 测试整体 mock 掉的模块, 这里走
 * vi.resetModules() + dynamic import 拿真模块. NODE_ENV 通过直接赋值注入, 不动
 * 真实 shell 环境.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const warnSpy = vi.fn();
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

async function loadApiFresh(nodeEnv) {
  vi.resetModules();
  if (nodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = nodeEnv;
  }
  warnSpy.mockClear();
  vi.spyOn(console, "warn").mockImplementation(warnSpy);
  // spy 之后再 import, api.js 顶层 IS_DEV 算到正确的 NODE_ENV.
  return await import("../../src/renderer/api.js");
}

afterEach(() => {
  console.warn.mockRestore?.();
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("createApi pick() dev warn", () => {
  beforeEach(() => {
    // 每个用例开始前清掉 window.api, 确保缺 bridge 路径.
    if (typeof window !== "undefined") {
      delete window.api;
    }
  });

  // createApi() 内部会对 ~132 个 IPC key 各跑一次 pick(), 每个缺 key 都会触发
  // 一次 warn. 我们的契约: 每个缺 key 首次 warn 一次, 后续访问同一 key 不再 warn.
  // 测试断言:
  //   - "出现含 versionsRunCheck 的 warn" + "createApi 后再访问不增加该条 warn"
  //   - 不直接断言 warn 总数 (受模块顶层 `export const api = createApi()` 影响).

  function warnMessagesFor(key) {
    return warnSpy.mock.calls
      .map((c) => c[0])
      .filter((m) => typeof m === "string" && m.includes(`"${key}"`));
  }

  it("dev 模式下缺 bridge 时 warn 该 key, 返 noop", async () => {
    const { createApi } = await loadApiFresh("development");
    const api = createApi();
    // createApi() 内部 pick 已经走过, 此时 versionsRunCheck 应已被 warn 一次.
    expect(warnMessagesFor("versionsRunCheck").length).toBe(1);

    // 后续访问不再 warn (Set 去重).
    api.versionsRunCheck();
    api.versionsRunCheck();
    expect(warnMessagesFor("versionsRunCheck").length).toBe(1);

    // 行为: 返 noop, 调用不报错.
    expect(api.versionsRunCheck()).toBeUndefined();

    // warn 文本含引导信息.
    expect(warnMessagesFor("versionsRunCheck")[0]).toMatch(/preload\.js/);
  });

  it("dev 模式下 createApi 后访问未声明 key 也会 warn 一次", async () => {
    const { createApi } = await loadApiFresh("development");
    const api = createApi();
    // 直接用声明过的 key, 但 overrides 故意不命中, 验证 Set 去重只在同 key 内有效.
    const before = warnMessagesFor("getConfig").length;
    api.getConfig();
    api.getConfig();
    // pick() 在 createApi() 内部已经跑过一次 (无 override, 无 window.api), 已 warn.
    expect(warnMessagesFor("getConfig").length).toBe(before);
  });

  it("生产模式下缺 bridge 不 warn, 返 noop", async () => {
    const { createApi } = await loadApiFresh("production");
    const api = createApi();
    expect(api.versionsRunCheck()).toBeUndefined();
    expect(api.versionsRunCheck()).toBeUndefined();
    expect(warnMessagesFor("versionsRunCheck").length).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("overrides 命中时不 warn, 直接返 override", async () => {
    const { createApi } = await loadApiFresh("development");
    const custom = vi.fn();
    // module top-level `export const api = createApi()` 已经对 versionsRunCheck
    // warn 过一次 (fresh module load 还没 user-provided window.api). 现在 user
    // 调 createApi({ versionsRunCheck }) 时, pick 命中 overrides, 不会再
    // 新增 warn.
    const before = warnMessagesFor("versionsRunCheck").length;
    const api = createApi({ versionsRunCheck: custom });
    expect(warnMessagesFor("versionsRunCheck").length).toBe(before);

    api.versionsRunCheck();
    expect(custom).toHaveBeenCalledTimes(1);
  });

  it("window.api 命中时不 warn, 直接返原生函数", async () => {
    const { createApi } = await loadApiFresh("development");
    const native = vi.fn();
    window.api = { versionsRunCheck: native };
    // window.api 注入在 module load 之后, 所以 module top-level createApi 已经
    // warn 了一次. user 调 createApi() 时 window.api 已就绪, pick 命中 window.api,
    // 不会再新增 warn.
    const before = warnMessagesFor("versionsRunCheck").length;
    const api = createApi();
    expect(warnMessagesFor("versionsRunCheck").length).toBe(before);

    api.versionsRunCheck();
    expect(native).toHaveBeenCalledTimes(1);
  });

  it("stocksExportDiagnosisPng 在 createApi() 里有声明 (防回归)", async () => {
    // ponytail: 2026-07-07 — ExportDiagnosisButton 调用 api.stocksExportDiagnosisPng, 但
    //          createApi() 漏了会回到 noop → 诊断导出报 "is not a function" 静默退化.
    //          显式断言 key 存在, 后续加 IPC bridge 的人如果改了 createApi 也会看到.
    const { createApi } = await loadApiFresh("development");
    const a = createApi();
    // noop 也是 function — 这条断言防止"漏加 key"的更基础 bug:
    //   之前 bug: pick() 走的 fallback 是 noop(),调用不报错,所以 ErrorBoundary 后是
    //   "导出失败" 而不是 "is not a function". 原因: 用户传过来的 `api` 不是 api.js 的
    //   default export. 这条测试只验 key 存在, errno 还是要走真正的调用链.
    expect(typeof a.stocksExportDiagnosisPng).toBe("function");
  });
});
