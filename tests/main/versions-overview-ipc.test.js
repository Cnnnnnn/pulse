/**
 * tests/main/versions-overview-ipc.test.js
 *
 * 6 个 IPC handler 单测 — 直接 require 导出函数, 验证返回结构与 stub 依赖交互.
 * 模式跟 tests/main/register-upgrade-advice-ipc.test.js 一致.
 *
 * ponytail: 主进程 handler 走 state-store (CJS) + recent-activity (CJS) + advisor stub,
 * 没有 ESM 依赖. 测试里 require.cache 替换 state-store / recent-activity / advisor.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const stateStorePath = require.resolve("../../src/main/state-store.js");
const recentPath = require.resolve("../../src/main/recent-activity.js");
const advisorPath = require.resolve("../../src/ai/versions-overview-advisor.js");
const registerPath = require.resolve(
  "../../src/main/ipc/register-versions-overview.js",
);

const stubAiSummary = vi.fn(async () => "static summary text");

// In-memory state-store mock (只暴露本测试需要的函数)
let mockApps = {};
let mockWatchlist = [];
let mockOverviewCache = null;
let saveCacheCalled = 0;

function stubModules() {
  vi.resetModules();
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: {
      load: () => ({ apps: mockApps }),
      loadWatchlist: () => mockWatchlist,
      loadOverviewCache: () => mockOverviewCache,
      saveOverviewCache: (entry) => {
        saveCacheCalled++;
        mockOverviewCache = { ...entry };
        return mockOverviewCache;
      },
    },
  };
  require.cache[recentPath] = {
    id: recentPath,
    filename: recentPath,
    loaded: true,
    exports: {
      list: () => mockRecentEntries,
    },
  };
  require.cache[advisorPath] = {
    id: advisorPath,
    filename: advisorPath,
    loaded: true,
    exports: { aiOverviewSummary: stubAiSummary },
  };
}

let mockRecentEntries = [];

beforeEach(() => {
  mockApps = {};
  mockWatchlist = [];
  mockOverviewCache = null;
  mockRecentEntries = [];
  saveCacheCalled = 0;
  stubAiSummary.mockReset();
  stubAiSummary.mockResolvedValue("static summary text");
  stubModules();
});

afterEach(() => {
  delete require.cache[stateStorePath];
  delete require.cache[recentPath];
  delete require.cache[advisorPath];
  delete require.cache[registerPath];
});

describe("register-versions-overview IPC", () => {
  it("导出 6 个 handler", () => {
    const mod = require(registerPath);
    expect(typeof mod.registerVersionsOverviewHandlers).toBe("function");
    expect(typeof mod.getOverviewKpis).toBe("function");
    expect(typeof mod.getOverviewTrend).toBe("function");
    expect(typeof mod.getOverviewWatchlist).toBe("function");
    expect(typeof mod.getOverviewRecent).toBe("function");
    expect(typeof mod.getOverviewAiInsights).toBe("function");
    expect(typeof mod.commandSearch).toBe("function");
  });

  it("getOverviewKpis 聚合 upgradable / latest / total / error", () => {
    mockApps = {
      vscode: { has_update: true, brew_cask: true, status: "update_available" },
      slack: { has_update: false, status: "up_to_date" },
      xcode: { has_update: true, brew_cask: true, status: "update_available" },
      broken: { status: "error" },
    };
    const { getOverviewKpis } = require(registerPath);
    const r = getOverviewKpis();
    expect(r).toEqual({ upgradable: 2, latest: 1, error: 1, total: 4 });
  });

  it("getOverviewKpis — 空 state → 全 0", () => {
    const { getOverviewKpis } = require(registerPath);
    expect(getOverviewKpis()).toEqual({
      upgradable: 0,
      latest: 0,
      error: 0,
      total: 0,
    });
  });

  it("getOverviewTrend — 缺 trendHistory 时返 [0]*7", () => {
    const { getOverviewTrend } = require(registerPath);
    const r = getOverviewTrend();
    expect(r).toHaveLength(7);
    expect(r.every((v) => v === 0)).toBe(true);
  });

  it("getOverviewWatchlist — 过滤 app 类型, 最多 6 个", () => {
    mockWatchlist = [
      { type: "app", ref: "vscode" },
      { type: "app", ref: "slack" },
      { type: "fund", ref: "000001" },
      { type: "app", ref: "iterm" },
    ];
    const { getOverviewWatchlist } = require(registerPath);
    const r = getOverviewWatchlist();
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.name)).toEqual(["vscode", "slack", "iterm"]);
  });

  it("getOverviewRecent — 截 10 条, 用 ref 当 appName", () => {
    mockRecentEntries = Array.from({ length: 15 }, (_, i) => ({
      kind: "app-upgrade",
      ref: `app${i}`,
      ts: i,
    }));
    const { getOverviewRecent } = require(registerPath);
    const r = getOverviewRecent();
    expect(r).toHaveLength(10);
    expect(r[0].appName).toBe("app0");
    expect(r[0].kind).toBe("app-upgrade");
  });

  it("getOverviewAiInsights — advisor 成功, 写缓存, fromCache=false", async () => {
    const { getOverviewAiInsights } = require(registerPath);
    const r = await getOverviewAiInsights();
    expect(r).toMatchObject({ ok: true, text: "static summary text", fromCache: false });
    expect(stubAiSummary).toHaveBeenCalled();
    expect(saveCacheCalled).toBe(1);
    expect(mockOverviewCache.text).toBe("static summary text");
  });

  it("getOverviewAiInsights — 缓存命中 24h 内 → fromCache=true, 不调 advisor", async () => {
    mockOverviewCache = { text: "cached!", fetchedAt: Date.now() - 60_000 };
    const { getOverviewAiInsights } = require(registerPath);
    const r = await getOverviewAiInsights();
    expect(r).toEqual({ ok: true, text: "cached!", fromCache: true });
    expect(stubAiSummary).not.toHaveBeenCalled();
    expect(saveCacheCalled).toBe(0);
  });

  it("getOverviewAiInsights — 缓存过期 → 重调", async () => {
    mockOverviewCache = {
      text: "stale",
      fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
    };
    const { getOverviewAiInsights } = require(registerPath);
    const r = await getOverviewAiInsights();
    expect(r.fromCache).toBe(false);
    expect(r.text).toBe("static summary text");
    expect(stubAiSummary).toHaveBeenCalled();
  });

  it("getOverviewAiInsights — advisor 抛错 → ok:false", async () => {
    stubAiSummary.mockRejectedValueOnce(new Error("boom"));
    const { getOverviewAiInsights } = require(registerPath);
    const r = await getOverviewAiInsights();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("advisor_failed");
    expect(r.error).toBe("boom");
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

  it("registerVersionsOverviewHandlers — 注册 6 个 channel", () => {
    const handlers = {};
    const { registerVersionsOverviewHandlers } = require(registerPath);
    registerVersionsOverviewHandlers({
      safeHandle: (ch, fn) => {
        handlers[ch] = fn;
      },
    });
    expect(Object.keys(handlers).sort()).toEqual([
      "versions:command-search",
      "versions:overview-ai-insights",
      "versions:overview-kpis",
      "versions:overview-recent",
      "versions:overview-trend",
      "versions:overview-watchlist",
    ]);
  });
});