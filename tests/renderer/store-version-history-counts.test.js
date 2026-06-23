// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  versionHistoryCounts,
  versionHistoryTotalSizeBytes,
  versionHistoryCountsLoaded,
  setVersionHistoryCounts,
  bumpVersionHistoryCount,
  installVersionHistoryCountsListener,
  _resetForTest,
} from "../../src/renderer/store-version-history-counts.js";

describe("store-version-history-counts", () => {
  let listeners;
  beforeEach(() => {
    _resetForTest();
    listeners = [];
    global.window.api = {
      onVersionHistoryCountsUpdated: vi.fn((cb) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        };
      }),
    };
  });
  afterEach(() => {
    delete global.window.api;
    _resetForTest();
  });

  it("setVersionHistoryCounts → Map + totalSize + loaded", () => {
    setVersionHistoryCounts({ Cursor: 2, Things: 1 }, 1024);
    expect(versionHistoryCounts.value.get("Cursor")).toBe(2);
    expect(versionHistoryCounts.value.get("Things")).toBe(1);
    expect(versionHistoryTotalSizeBytes.value).toBe(1024);
    expect(versionHistoryCountsLoaded.value).toBe(true);
  });

  it("bumpVersionHistoryCount: > 0 → set; = 0 → delete", () => {
    setVersionHistoryCounts({ Cursor: 2 });
    bumpVersionHistoryCount("Cursor", 3);
    expect(versionHistoryCounts.value.get("Cursor")).toBe(3);
    bumpVersionHistoryCount("Cursor", 0);
    expect(versionHistoryCounts.value.has("Cursor")).toBe(false);
  });

  it("installVersionHistoryCountsListener: 装一次, 收到广播即 update store", () => {
    installVersionHistoryCountsListener();
    expect(window.api.onVersionHistoryCountsUpdated).toHaveBeenCalledTimes(1);
    // 第二次 install 应幂等
    installVersionHistoryCountsListener();
    expect(window.api.onVersionHistoryCountsUpdated).toHaveBeenCalledTimes(1);
    // 模拟 broadcast
    listeners.forEach((cb) => cb({ counts: { Cursor: 2, Things: 1 }, totalSizeBytes: 4096 }));
    expect(versionHistoryCounts.value.get("Cursor")).toBe(2);
    expect(versionHistoryTotalSizeBytes.value).toBe(4096);
  });

  it("no window.api → install 安全 noop", () => {
    delete global.window.api;
    expect(() => installVersionHistoryCountsListener()).not.toThrow();
  });
});