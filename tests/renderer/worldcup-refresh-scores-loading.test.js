// @vitest-environment happy-dom
/**
 * 回归测试: refreshWorldcupScores 必须在整个函数生命周期里
 * 维护 worldcupScoresLoading = true, 包括 fixtures 阶段.
 *
 * Bug 场景 (修复前):
 *   用户点刷新 → fixtures < 70 → loadWorldcupFixtures(true) 8s
 *   期间 worldcupScoresLoading === false
 *   → 按钮不 disable / 不转圈
 *   → 用户重复点 → IPC 堆积 → UI 卡死
 *
 * 修复后:
 *   refreshWorldcupScores 进函数立刻 set loading=true
 *   直到 finally 才置 false (任何早期 return / 错误路径都覆盖)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("refreshWorldcupScores loading lifecycle", () => {
  let refreshWorldcupScores;
  let worldcupScoresLoading;
  let loadFixturesDeferred;
  let refreshScoresDeferred;

  beforeEach(async () => {
    loadFixturesDeferred = {};
    loadFixturesDeferred.promise = new Promise((resolve) => {
      loadFixturesDeferred.resolve = resolve;
    });
    refreshScoresDeferred = {};
    refreshScoresDeferred.promise = new Promise((resolve) => {
      refreshScoresDeferred.resolve = resolve;
    });

    global.window.api = {
      worldcupFetchFixtures: vi.fn(async () => ({
        ok: true,
        data: { matches: _buildMatches(72) },
      })),
      worldcupLoadScores: vi.fn(async () => ({ ok: true, scores: {} })),
      worldcupRefreshScores: vi.fn(async () => refreshScoresDeferred.promise),
      worldcupLoadInsights: vi.fn(async () => ({ ok: true, insights: {} })),
      worldcupLoadBets: vi.fn(async () => ({ ok: true, worldcupBets: {} })),
    };

    vi.resetModules();
    const store = await import("../../src/renderer/worldcup/store.js");
    refreshWorldcupScores = store.refreshWorldcupScores;
    worldcupScoresLoading = store.worldcupScoresLoading;
    // 每个 case 起点前清掉前面测试残留的 loading state
    worldcupScoresLoading.value = false;
  });

  function _buildMatches(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      // 用历史日期 + 已开球, 让 isScoreRefreshEligible 返回 true
      out.push({
        team1: `T1_${i}`,
        team2: `T2_${i}`,
        date: "2026-06-11",
        time: "20:00",
        timezone: "UTC-6",
        stage: "Group A",
        venue: "X",
      });
    }
    return out;
  }

  it("fixtures 阶段也保持 loading=true (regression: 点不动 bug)", async () => {
    // 让 worldcupFetchFixtures 卡住, 模拟 8s timeout 期间的状态
    global.window.api.worldcupFetchFixtures.mockImplementationOnce(
      async () => loadFixturesDeferred.promise,
    );

    // 触发 refresh (不 await)
    const p = refreshWorldcupScores();

    // 让 microtask flush
    await Promise.resolve();
    await Promise.resolve();

    // 关键断言: 进入 fixtures await 期间 loading 必须为 true
    expect(worldcupScoresLoading.value).toBe(true);

    // 解锁 fixtures, 完成 refresh
    loadFixturesDeferred.resolve({
      ok: true,
      data: { matches: _buildMatches(72) },
    });
    refreshScoresDeferred.resolve({ ok: true, scores: {} });
    await p;

    expect(worldcupScoresLoading.value).toBe(false);
  });

  it("并发调用 refresh 时第二次直接 return false (守卫)", async () => {
    global.window.api.worldcupFetchFixtures.mockImplementationOnce(
      async () => loadFixturesDeferred.promise,
    );

    const p1 = refreshWorldcupScores();
    await Promise.resolve();
    await Promise.resolve();

    // 第二次调, loading 已经 true, 应该立刻 return false
    const r2 = await refreshWorldcupScores();
    expect(r2).toBe(false);

    // 清理
    loadFixturesDeferred.resolve({
      ok: true,
      data: { matches: _buildMatches(72) },
    });
    refreshScoresDeferred.resolve({ ok: true, scores: {} });
    await p1;
  });

  it("fixtures 失败时 loading 也正确 reset (finally 覆盖 early return)", async () => {
    global.window.api.worldcupFetchFixtures.mockImplementationOnce(
      async () => ({ ok: false, reason: "network_error" }),
    );

    const r = await refreshWorldcupScores();
    expect(r).toBe(false);
    // 关键: 即使 fixtures 失败 early return, loading 也必须 reset
    expect(worldcupScoresLoading.value).toBe(false);
  });

  it("fixtures throw 时 loading 也正确 reset (catch + finally 覆盖)", async () => {
    global.window.api.worldcupFetchFixtures.mockImplementationOnce(async () => {
      throw new Error("unexpected");
    });

    const r = await refreshWorldcupScores();
    expect(r).toBe(false);
    expect(worldcupScoresLoading.value).toBe(false);
  });
});
