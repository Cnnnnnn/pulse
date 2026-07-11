import { describe, it, expect, afterEach } from "vitest";
import {
  navHistoryCache,
  loadFundNavHistory,
  prefetchAllNavHistory,
  loadFunds,
  holdings,
  fundsLoading,
  fundsLoadError,
} from "../../src/renderer/funds/fundStore.js";

afterEach(() => {
  navHistoryCache.value = {};
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
