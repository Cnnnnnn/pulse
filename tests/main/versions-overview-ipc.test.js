/**
 * tests/main/versions-overview-ipc.test.js
 *
 * commandSearch + run-check IPC handler 单测.
 *
 * 2026-07-10: 删除洞察 (overview) 页后, 移除 getOverviewKpis/Trend/Watchlist/
 * Recent/AiInsights 的测试. 保留 commandSearch 和 versions:run-check.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const checkRunnerPath = require.resolve("../../src/main/check-runner.js");
const registerPath =
  require.resolve("../../src/main/ipc/register-versions-overview.js");

const stubRunCheckQueued = vi.fn(async () => []);

function stubModules() {
  vi.resetModules();
  require.cache[checkRunnerPath] = {
    id: checkRunnerPath,
    filename: checkRunnerPath,
    loaded: true,
    exports: { runCheckQueued: stubRunCheckQueued },
  };
}

beforeEach(() => {
  stubRunCheckQueued.mockReset();
  stubRunCheckQueued.mockResolvedValue([]);
  stubModules();
});

afterEach(() => {
  delete require.cache[checkRunnerPath];
  delete require.cache[registerPath];
});

describe("register-versions-overview IPC", () => {
  it("导出 registerVersionsOverviewHandlers + commandSearch", () => {
    const mod = require(registerPath);
    expect(typeof mod.registerVersionsOverviewHandlers).toBe("function");
    expect(typeof mod.commandSearch).toBe("function");
  });

  it("commandSearch — 空 query 返空数组", async () => {
    const { commandSearch } = require(registerPath);
    const r = await commandSearch({});
    expect(r).toEqual({ ok: true, results: [] });
  });

  it("commandSearch — 'check' 匹配检查更新 action", async () => {
    const { commandSearch } = require(registerPath);
    const r = await commandSearch({}, "check");
    expect(r.ok).toBe(true);
    expect(r.results.some((x) => x.id === "action-check")).toBe(true);
  });

  it("commandSearch — 不再包含 insights view", async () => {
    const { commandSearch } = require(registerPath);
    const r = await commandSearch({}, "insights");
    expect(r.results.some((x) => x.id === "insights")).toBe(false);
  });

  it("registerVersionsOverviewHandlers — 注册 command-search + run-check", () => {
    const handlers = {};
    const { registerVersionsOverviewHandlers } = require(registerPath);
    registerVersionsOverviewHandlers({
      safeHandle: (ch, fn) => {
        handlers[ch] = fn;
      },
    });
    expect(Object.keys(handlers).sort()).toEqual([
      "versions:command-search",
      "versions:run-check",
    ]);
  });

  it("versions:run-check — 调 runCheckQueued, 返 { started: true }", async () => {
    const handlers = {};
    const { registerVersionsOverviewHandlers } = require(registerPath);
    registerVersionsOverviewHandlers({
      safeHandle: (ch, fn) => {
        handlers[ch] = fn;
      },
      getConfig: () => ({ apps: [] }),
      pool: {},
      getWindow: () => null,
      onCheckComplete: () => {},
    });
    const r = await handlers["versions:run-check"]();
    expect(stubRunCheckQueued).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ started: true });
  });

  it("versions:run-check — runCheckQueued 抛错 → 返 { started: false, error }", async () => {
    stubRunCheckQueued.mockRejectedValueOnce(new Error("boom"));
    const handlers = {};
    const { registerVersionsOverviewHandlers } = require(registerPath);
    registerVersionsOverviewHandlers({
      safeHandle: (ch, fn) => {
        handlers[ch] = fn;
      },
      getConfig: () => ({ apps: [] }),
      pool: {},
      getWindow: () => null,
      onCheckComplete: () => {},
    });
    const r = await handlers["versions:run-check"]();
    expect(r).toEqual({
      started: false,
      reason: "check_failed",
      error: "boom",
    });
  });
});
