import { describe, it, expect, afterEach } from "vitest";
import {
  navHistoryCache,
  navHistoryLoading,
  loadFundNavHistory,
  prefetchAllNavHistory,
  loadFunds,
  holdings,
  fundsLoading,
  fundsLoadError,
} from "../../src/renderer/funds/fundStore.js";

afterEach(() => {
  navHistoryCache.value = {};
  navHistoryLoading.value = {};
  holdings.value = [];
  fundsLoadError.value = null;
  fundsLoading.value = false;
});

describe("loadFundNavHistory (renderer cache)", () => {
  it("caches series by code via fake api", async () => {
    const fakeApi = {
      fundsNavHistory: async () => ({ ok: true, series: [{ date: "2026-07-10", nav: 1.2 }] }),
    };
    const r = await loadFundNavHistory(fakeApi, "000001");
    expect(r.ok).toBe(true);
    expect(navHistoryCache.value["000001"].series.length).toBe(1);
  });
  it("empty code returns not ok", async () => {
    const r = await loadFundNavHistory({}, "");
    expect(r.ok).toBe(false);
  });
  // 2026-07-15: 用户反馈 1M/3M/6M/1Y 切换但只能拿到 1 个月数据
  //   ponytail: 验证 (1) 默认拉 90 条 (高频区间 1M/3M 的甜点) (2) 缓存足够时不再拉
  //             (3) 显式 days 走对应 pageSize (4) 加载期间 navHistoryLoading 标记
  it("默认拉 90 条 (覆盖 1M/3M 高频区间, 6M/1Y/ALL 按需补拉)", async () => {
    let requestedDays = 0;
    const fakeApi = {
      fundsNavHistory: async (_code, opts) => {
        requestedDays = (opts && opts.days) || 0;
        return { ok: true, series: Array.from({ length: requestedDays }, (_, i) => ({ date: `2026-07-${i + 1}`, nav: 1 + i * 0.001 })) };
      },
    };
    await loadFundNavHistory(fakeApi, "000001");
    expect(requestedDays).toBe(90);
  });
  it("缓存行数 >= 需求时不再发起请求", async () => {
    navHistoryCache.value = {
      "000001": { series: Array.from({ length: 365 }, (_, i) => ({ date: `d${i}`, nav: 1 })), loadedAt: Date.now() },
    };
    let called = false;
    const fakeApi = {
      fundsNavHistory: async () => {
        called = true;
        return { ok: true, series: [] };
      },
    };
    const r = await loadFundNavHistory(fakeApi, "000001", { days: 90 });
    expect(called).toBe(false);
    expect(r.cached).toBe(true);
  });
  it("缓存不够时按需求 days 重新拉取 (且不少于默认 90)", async () => {
    navHistoryCache.value = {
      "000001": { series: Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, nav: 1 })), loadedAt: Date.now() },
    };
    let requestedDays = 0;
    const fakeApi = {
      fundsNavHistory: async (_code, opts) => {
        requestedDays = (opts && opts.days) || 0;
        return { ok: true, series: Array.from({ length: 365 }, (_, i) => ({ date: `d${i}`, nav: 1 })) };
      },
    };
    await loadFundNavHistory(fakeApi, "000001", { days: 180 });
    // 180 > 90 默认下限, 所以请求 180 (用户明确要 6M, 直接满足)
    expect(requestedDays).toBe(180);
  });
  it("需求 days 小于默认 90 时, 仍请求 90 (免去后续 3M 再次拉取)", async () => {
    let requestedDays = 0;
    const fakeApi = {
      fundsNavHistory: async (_code, opts) => {
        requestedDays = (opts && opts.days) || 0;
        return { ok: true, series: Array.from({ length: requestedDays }, (_, i) => ({ date: `d${i}`, nav: 1 })) };
      },
    };
    await loadFundNavHistory(fakeApi, "000002", { days: 30 });
    expect(requestedDays).toBe(90);
  });
  it("pageSize 上限 9999, 即使传 99999 也只请求 9999", async () => {
    let requestedDays = 0;
    const fakeApi = {
      fundsNavHistory: async (_code, opts) => {
        requestedDays = (opts && opts.days) || 0;
        return { ok: true, series: Array.from({ length: 9999 }, (_, i) => ({ date: `d${i}`, nav: 1 })) };
      },
    };
    await loadFundNavHistory(fakeApi, "000001", { days: 99999 });
    expect(requestedDays).toBe(9999);
  });
  // 2026-07-15: 加载状态 — FundDetail 用这个信号显示「加载更长历史」徽章
  it("拉取期间 navHistoryLoading 标记该 code, 完成后清除", async () => {
    let resolveApi;
    const fakeApi = {
      fundsNavHistory: () => new Promise((res) => { resolveApi = () => res({ ok: true, series: [{ date: "d", nav: 1 }] }); }),
    };
    const p = loadFundNavHistory(fakeApi, "000001");
    // 微任务: await 已执行, loading 标记已设
    await Promise.resolve();
    await Promise.resolve();
    expect(navHistoryLoading.value["000001"]).toBe(true);
    resolveApi();
    await p;
    expect(navHistoryLoading.value["000001"]).toBeUndefined();
  });
  it("失败也清除 loading 标记", async () => {
    const fakeApi = {
      fundsNavHistory: async () => ({ ok: false, reason: "net" }),
    };
    await loadFundNavHistory(fakeApi, "000001");
    expect(navHistoryLoading.value["000001"]).toBeUndefined();
  });
  // 2026-07-15: 主进程曾把 30 天短缓存永久返回 — 渲染层必须在缓存不足时再次请求
  it("短缓存 (30) 切到 1Y (365) 会重新请求并写入更长 series", async () => {
    navHistoryCache.value = {
      "000001": {
        series: Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, nav: 1 })),
        loadedAt: Date.now(),
        fetchedDays: 30,
      },
    };
    let requestedDays = 0;
    const fakeApi = {
      fundsNavHistory: async (_code, opts) => {
        requestedDays = (opts && opts.days) || 0;
        return {
          ok: true,
          series: Array.from({ length: 365 }, (_, i) => ({ date: `d${i}`, nav: 1 })),
        };
      },
    };
    const r = await loadFundNavHistory(fakeApi, "000001", { days: 365 });
    expect(requestedDays).toBe(365);
    expect(r.series.length).toBe(365);
    expect(navHistoryCache.value["000001"].series.length).toBe(365);
    expect(navHistoryCache.value["000001"].fetchedDays).toBe(365);
  });
  it("基金上市不足: 已按 365 拉过但只有 100 条 → 不再重复请求", async () => {
    navHistoryCache.value = {
      "000001": {
        series: Array.from({ length: 100 }, (_, i) => ({ date: `d${i}`, nav: 1 })),
        loadedAt: Date.now(),
        fetchedDays: 365,
      },
    };
    let called = false;
    const fakeApi = {
      fundsNavHistory: async () => {
        called = true;
        return { ok: true, series: [] };
      },
    };
    const r = await loadFundNavHistory(fakeApi, "000001", { days: 365 });
    expect(called).toBe(false);
    expect(r.cached).toBe(true);
    expect(r.series.length).toBe(100);
  });
  // 2026-07-15: 东财单页=20 脏标记自愈 — 即使 fetchedDays 被误标成 365 也要重拉
  it("series 恰为 20 且 fetchedDays>20 → 视为脏缓存, 允许重拉", async () => {
    navHistoryCache.value = {
      "000001": {
        series: Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, nav: 1 })),
        loadedAt: Date.now(),
        fetchedDays: 365,
      },
    };
    let called = false;
    const fakeApi = {
      fundsNavHistory: async () => {
        called = true;
        return {
          ok: true,
          series: Array.from({ length: 365 }, (_, i) => ({ date: `n${i}`, nav: 1 })),
        };
      },
    };
    const r = await loadFundNavHistory(fakeApi, "000001", { days: 365 });
    expect(called).toBe(true);
    expect(r.series.length).toBe(365);
  });
});

describe("prefetchAllNavHistory (Task C)", () => {
  it("预拉所有未缓存 code 的 series", async () => {
    holdings.value = [
      { code: "A" }, { code: "B" }, { code: "C" }, { code: "D" }, { code: "E" },
    ];
    const api = {
      fundsNavHistory: async (code) => ({ ok: true, series: [{ date: "2026-07-01", nav: 1 }] }),
    };
    await prefetchAllNavHistory(api);
    const codes = ["A", "B", "C", "D", "E"];
    for (const c of codes) {
      expect(navHistoryCache.value[c] && navHistoryCache.value[c].series.length).toBe(1);
    }
  });

  it("并发峰值 ≤ 3 且每个 code 只拉一次", async () => {
    holdings.value = [
      { code: "A" }, { code: "B" }, { code: "C" }, { code: "D" }, { code: "E" },
    ];
    let active = 0;
    let peak = 0;
    let calls = 0;
    const api = {
      fundsNavHistory: async (code) => {
        calls += 1;
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((res) => setTimeout(res, 5));
        active -= 1;
        return { ok: true, series: [{ date: "2026-07-01", nav: 1 }] };
      },
    };
    await prefetchAllNavHistory(api, { concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(calls).toBe(5);
    expect(Object.keys(navHistoryCache.value).length).toBe(5);
  });

  it("已缓存的 code 不会重复拉取", async () => {
    holdings.value = [{ code: "A" }, { code: "B" }];
    let calls = 0;
    const api = {
      fundsNavHistory: async () => {
        calls += 1;
        return { ok: true, series: [{ date: "2026-07-01", nav: 1 }] };
      },
    };
    await prefetchAllNavHistory(api);
    // 第二次调用应跳过已缓存的 A/B
    await prefetchAllNavHistory(api);
    expect(calls).toBe(2);
  });
});

describe("loadFunds (Task B) — 加载状态", () => {
  it("失败分支设置 fundsLoadError 且 fundsLoading 复位", async () => {
    const api = { fundsList: async () => ({ ok: false, reason: "boom" }) };
    await loadFunds(api);
    expect(fundsLoadError.value).toBe("boom");
    expect(fundsLoading.value).toBe(false);
    expect(holdings.value).toEqual([]);
  });

  it("抛异常也设置 fundsLoadError", async () => {
    const api = { fundsList: async () => { throw new Error("net err"); } };
    await loadFunds(api);
    expect(fundsLoadError.value).toBe("net err");
    expect(fundsLoading.value).toBe(false);
  });

  it("成功分支清空错误", async () => {
    fundsLoadError.value = "old";
    const api = {
      fundsList: async () => ({ ok: true, holdings: [{ id: "1", code: "X" }] }),
    };
    await loadFunds(api);
    expect(fundsLoadError.value).toBeNull();
    expect(fundsLoading.value).toBe(false);
    expect(holdings.value.length).toBe(1);
  });
});
