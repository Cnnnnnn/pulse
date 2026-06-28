// @vitest-environment happy-dom
/**
 * tests/renderer/metals/metalStore-coldstart.test.js
 *
 * 冷启动兜底: 进入贵金属 tab 时 quoteCache.fetchedAt 为空 → 主动 fetchNow 一次,
 * 避免空白 table 等待用户手动点刷新.
 *
 * 触发场景: app 重启后 scheduler.start() 的 fire-and-forget fetchNow 还在跑
 * 或已经失败, 此时切到 metals tab, getState 返空 cache, 必须主动拉一次.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  quoteCache,
  historyMap,
  initMetalStore,
  cleanupMetalStore,
  refreshNow,
  resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

function makeMetalsApi({ initialState, fetchNowResult, fetchNowThrows }) {
  const subs = {};
  return {
    list: async () => ({ watchedIds: [], holdings: {}, deletedIds: [] }),
    getState: async () => initialState,
    getHistory: async () => ({ historyMap: {} }),
    onQuoteChanged: (cb) => { subs.q = cb; return () => {}; },
    onStateUpdate: () => () => {},
    onHistoryChanged: () => () => {},
    fetchNow: async () => {
      if (fetchNowThrows) throw fetchNowThrows;
      return fetchNowResult;
    },
  };
}

describe("metalStore cold-start fetchNow", () => {
  beforeEach(() => {
    resetMetalStore();
    global.window = global.window || {};
  });

  it("quoteCache.fetchedAt 为空时主动 fetchNow 一次, 写入 cache", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      quotes: { data: { XAU: { price: 700 } }, errors: {}, fetchedAt: 1234 },
      fx: { rate: 7.18, fetchedAt: 1234 },
      historyMap: { XAU: [{ date: "2026-06-01", close: 690 }] },
    });
    global.window.metalsApi = {
      ...makeMetalsApi({
        initialState: { quotes: { data: {}, errors: {}, fetchedAt: null }, fx: { rate: null, fetchedAt: null }, scheduler: { status: "idle" } },
      }),
      fetchNow: fetchSpy,
    };
    await initMetalStore();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(quoteCache.value.data.XAU.price).toBe(700);
    expect(quoteCache.value.fetchedAt).toBe(1234);
  });

  it("quoteCache.fetchedAt 已存在 (scheduler 已跑过) → 不再 fetchNow", async () => {
    const fetchSpy = vi.fn();
    global.window.metalsApi = {
      ...makeMetalsApi({
        initialState: { quotes: { data: { XAU: { price: 700 } }, errors: {}, fetchedAt: 999 }, fx: { rate: 7.18, fetchedAt: 999 }, scheduler: { status: "idle" } },
      }),
      fetchNow: fetchSpy,
    };
    await initMetalStore();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetchNow 抛错时不崩, warn 即可, 让 refresh 按钮兜底", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    global.window.metalsApi = makeMetalsApi({
      initialState: { quotes: { data: {}, errors: {}, fetchedAt: null }, fx: { rate: null, fetchedAt: null }, scheduler: { status: "idle" } },
      fetchNowThrows: new Error("network down"),
    });
    await expect(initMetalStore()).resolves.not.toThrow();
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("[metals] cold-start fetchNow failed"),
      expect.stringContaining("network down"),
    );
    consoleWarn.mockRestore();
  });

  it("fetchNow response.historyMap 同步到 historyMap signal (消除 'quote 出了但 30 天还在加载中' 竞态)", async () => {
    const fetchResult = {
      ok: true,
      quotes: { data: { XAU: { price: 700 } }, errors: {}, fetchedAt: 999 },
      fx: { rate: 7.18, fetchedAt: 999 },
      historyMap: {
        XAU: [{ date: "2026-06-01", close: 690 }, { date: "2026-06-02", close: 695 }],
        AU9999: [{ date: "2026-06-01", close: 880 }, { date: "2026-06-02", close: 885 }],
      },
    };
    global.window.metalsApi = {
      ...makeMetalsApi({
        initialState: { quotes: { data: {}, errors: {}, fetchedAt: null }, fx: { rate: null, fetchedAt: null }, scheduler: { status: "idle" } },
      }),
      fetchNow: async () => fetchResult,
    };
    await initMetalStore();
    // historyMap 来自 response 同步, 不依赖 onHistoryChanged 事件时序
    expect(historyMap.value.XAU.length).toBe(2);
    expect(historyMap.value.XAU[0].close).toBe(690);
    expect(historyMap.value.AU9999[1].close).toBe(885);
  });

  it("refreshNow() 也同步 historyMap (手动点刷新)", async () => {
    // 已有 quoteCache, 不走 cold-start, 走 refreshNow 路径
    const fetchResult = {
      ok: true,
      quotes: { data: {}, errors: {}, fetchedAt: Date.now() },
      fx: { rate: 7.18, fetchedAt: Date.now() },
      historyMap: { XAU: [{ date: "2026-06-02", close: 700 }] },
    };
    global.window.metalsApi = {
      ...makeMetalsApi({
        initialState: {
          quotes: { data: { XAU: { price: 700 } }, errors: {}, fetchedAt: Date.now() },
          fx: { rate: 7.18, fetchedAt: Date.now() },
          scheduler: { status: "idle" },
        },
      }),
      fetchNow: async () => fetchResult,
    };
    await initMetalStore();
    expect(historyMap.value.XAU).toBeUndefined();
    await refreshNow();
    expect(historyMap.value.XAU.length).toBe(1);
  });
});
