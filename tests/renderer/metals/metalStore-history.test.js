// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  historyMap,
  selectedMetalId,
  initMetalStore,
  cleanupMetalStore,
  resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("metalStore history signals", () => {
  beforeEach(() => {
    resetMetalStore();
    global.window = global.window || {};
  });

  it("selectedMetalId 默认 'XAU'", () => {
    expect(selectedMetalId.value).toBe("XAU");
  });

  it("initMetalStore 拉 getHistory 后, historyMap 写入", async () => {
    const fakeHistory = {
      historyMap: { XAU: [{ date: "2026-05-01", close: 100 }] },
    };
    global.window.metalsApi = {
      list: async () => ({ watchedIds: [], holdings: {}, deletedIds: [] }),
      getState: async () => ({ quotes: { data: {} }, fx: { rate: null }, scheduler: { status: "idle" } }),
      getHistory: async () => fakeHistory,
      onQuoteChanged: () => () => {},
      onStateUpdate: () => () => {},
      onHistoryChanged: () => () => {},
    };
    await initMetalStore();
    expect(historyMap.value.XAU).toEqual([{ date: "2026-05-01", close: 100 }]);
  });

  it("onHistoryChanged 回调 → historyMap 同步更新", async () => {
    let histCb;
    global.window.metalsApi = {
      list: async () => ({ watchedIds: [], holdings: {}, deletedIds: [] }),
      getState: async () => ({ quotes: { data: {} }, fx: { rate: null }, scheduler: { status: "idle" } }),
      getHistory: async () => ({ historyMap: {} }),
      onQuoteChanged: () => () => {},
      onStateUpdate: () => () => {},
      onHistoryChanged: (cb) => { histCb = cb; return () => {}; },
    };
    await initMetalStore();
    expect(histCb).toBeDefined();
    histCb({ historyMap: { XAU: [{ date: "2026-06-01", close: 999 }] } });
    expect(historyMap.value.XAU[0].close).toBe(999);
  });

  it("cleanupMetalStore 幂等", async () => {
    global.window.metalsApi = {
      list: async () => ({ watchedIds: [], holdings: {}, deletedIds: [] }),
      getState: async () => ({ quotes: { data: {} }, fx: { rate: null }, scheduler: { status: "idle" } }),
      getHistory: async () => ({ historyMap: {} }),
      onQuoteChanged: () => () => {},
      onStateUpdate: () => () => {},
      onHistoryChanged: () => () => {},
    };
    await initMetalStore();
    cleanupMetalStore();
    cleanupMetalStore(); // 不抛
  });
});
