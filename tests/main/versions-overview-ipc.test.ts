/**
 * tests/main/versions-overview-ipc.test.js
 *
 * commandSearch IPC handler 单测.
 *
 * 2026-07-10: 删除洞察 (overview) 页后, 移除 getOverviewKpis/Trend/Watchlist/
 * Recent/AiInsights 的测试. 保留 commandSearch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const { mainArtifactPath } = _require("../_setup/require-main.cjs");
const registerPath = mainArtifactPath("ipc/register-versions-overview");

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
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

  it("commandSearch — 不再包含 overview view", async () => {
    const { commandSearch } = require(registerPath);
    const r = await commandSearch({}, "overview");
    expect(r.results.some((x) => x.id === "overview")).toBe(false);
  });

  it("registerVersionsOverviewHandlers — 只注册 command-search", () => {
    const handlers = {};
    const { registerVersionsOverviewHandlers } = require(registerPath);
    registerVersionsOverviewHandlers({
      safeHandle: (ch, fn) => {
        handlers[ch] = fn;
      },
    });
    expect(Object.keys(handlers)).toEqual(["versions:command-search"]);
  });
});
