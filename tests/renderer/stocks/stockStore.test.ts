/**
 * tests/renderer/stocks/stockStore.test.js
 *
 * ponytail: stockStore 是 renderer 状态中心, 当前唯一"重点"是 D-6 静默刷新 + silent setInterval 控制.
 * 其余 (setCriteria / setSort / setStrategy) 都是常规 signal 写入, 覆盖率由 stock-filter + StockDiagnosisPage 测试间接触达.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  criteria,
  results,
  silentRefreshTick,
  startRefreshTimer,
  stopRefreshTimer,
  runScreen,
  runScreenSilent,
  stocksDataState,
  dataProvider,
  dataTruncated,
  error,
} from "../../../src/renderer/stocks/stockStore.ts";

describe("stockStore D-6 静默刷新", () => {
  beforeEach(() => {
    stopRefreshTimer();
    results.value = [];
    error.value = null;
    dataProvider.value = "unknown";
    dataTruncated.value = false;
    stocksDataState.value = {
      phase: "idle",
      data: [],
      error: null,
      source: "unknown",
      fetchedAt: 0,
      lastAttemptAt: 0,
    };
    silentRefreshTick.value = 0;
  });
  afterEach(() => {
    stopRefreshTimer();
  });

  it("D-6: silentRefreshTick signal 暴露给 UI 订阅, 默认 0", () => {
    expect(silentRefreshTick.value).toBe(0);
  });

  it("D-6: startRefreshTimer setInterval 后 tick 累计 (+1)", () => {
    vi.useFakeTimers();
    try {
      startRefreshTimer();
      expect(silentRefreshTick.value).toBe(0);
      vi.advanceTimersByTime(60_001); // 1 个 REFRESH_INTERVAL_MS
      expect(silentRefreshTick.value).toBeGreaterThanOrEqual(1);
      vi.advanceTimersByTime(60_000);
      expect(silentRefreshTick.value).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("D-6: stopRefreshTimer 清掉前一个 timer, 不会 leak", () => {
    vi.useFakeTimers();
    try {
      startRefreshTimer();
      startRefreshTimer(); // 第二次启动应替换第一次, 不重复 +1
      const t1 = silentRefreshTick.value;
      vi.advanceTimersByTime(120_000);
      // 单一 timer 推进 120s → 应该 =2 次 tick; 如果有 2 个 timer 就是 4 次
      expect(silentRefreshTick.value).toBeLessThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("D-6: runScreenSilent 拉成功 → 写回 results, 不闪 loading", async () => {
    criteria.value = { marketCapTier: "all", industries: [] };
    const fakeApi = {
      stocksScreen: vi.fn().mockResolvedValue({
        ok: true,
        results: [
          { code: "000001", name: "测试", price: 10, changePct: 1, marketCap: 6e11, roe: 18 },
        ],
        fetchedAt: 100,
        source: "eastmoney",
        truncated: false,
      }),
    };
    const before = results.value;
    await runScreenSilent(fakeApi);
    expect(results.value).toEqual([
      { code: "000001", name: "测试", price: 10, changePct: 1, marketCap: 6e11, roe: 18 },
    ]);
    expect(stocksDataState.value.phase).toBe("ready");
    expect(stocksDataState.value.source).toBe("live");
    expect(dataProvider.value).toBe("eastmoney");
    expect(dataTruncated.value).toBe(false);
  });

  it("D-6: runScreenSilent 拉失败 → 静默, 不动 results 不报错", async () => {
    results.value = [{ code: "000002", name: "保留", price: 99 }];
    const fakeApi = {
      stocksScreen: vi.fn().mockRejectedValue(new Error("network")),
    };
    await runScreenSilent(fakeApi);
    expect(results.value).toEqual([{ code: "000002", name: "保留", price: 99 }]);
  });

  it("D-6: runScreenSilent 拉 ok 但 results=[] → 不重置现有 results", async () => {
    // ponytail: 后端偶发返空不覆盖前端已有数据 (防"刷新闪空")
    const previous = [{ code: "000001", name: "X", price: 5 }];
    results.value = previous;
    stocksDataState.value = {
      phase: "ready",
      data: previous,
      error: null,
      source: "live",
      fetchedAt: 100,
      lastAttemptAt: 100,
    };
    const fakeApi = {
      stocksScreen: vi.fn().mockResolvedValue({
        ok: true,
        results: [],
        fetchedAt: 200,
      }),
    };
    await runScreenSilent(fakeApi);
    expect(results.value).toEqual(previous);
    expect(stocksDataState.value.phase).toBe("stale");
    expect(stocksDataState.value.error).toBe("刷新返回空结果");
  });

  it("runScreen 命中主进程缓存时标记 cache，并保留 provider/truncated 元数据", async () => {
    await runScreen({
      stocksScreen: async () => ({
        ok: true,
        results: [{ code: "600519", name: "贵州茅台" }],
        fetchedAt: 300,
        fromCache: true,
        source: "eastmoney",
        truncated: true,
      }),
    });

    expect(stocksDataState.value.source).toBe("cache");
    expect(dataProvider.value).toBe("eastmoney");
    expect(dataTruncated.value).toBe(true);
  });

  it("手动筛选失败保留已有结果并标记为 stale", async () => {
    const previous = [{ code: "000001", name: "保留", price: 10 }];
    results.value = previous;
    stocksDataState.value = {
      phase: "ready",
      data: previous,
      error: null,
      source: "live",
      fetchedAt: 100,
      lastAttemptAt: 100,
    };

    await runScreen({
      stocksScreen: async () => ({ ok: false, error: "network" }),
    });

    expect(results.value).toEqual(previous);
    expect(stocksDataState.value.phase).toBe("stale");
    expect(stocksDataState.value.error).toBe("network");
  });
});
