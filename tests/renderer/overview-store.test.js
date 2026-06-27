/**
 * tests/renderer/overview-store.test.js
 *
 * Overview 页面 5 个 signal + setter + reset 的单测.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  kpis,
  trend,
  watchlistQuick,
  recentActivity,
  aiInsights,
  setKpis,
  setTrend,
  setWatchlistQuick,
  setRecentActivity,
  setAiInsights,
  resetOverview,
} from "../../src/renderer/overview-store.js";

beforeEach(() => {
  resetOverview();
});

describe("overview-store", () => {
  it("默认空状态", () => {
    expect(kpis.value).toEqual({ upgradable: 0, latest: 0, error: 0, total: 0 });
    expect(trend.value).toEqual([]);
    expect(watchlistQuick.value).toEqual([]);
    expect(recentActivity.value).toEqual([]);
    expect(aiInsights.value).toEqual({ status: "idle", text: "", fromCache: false });
  });

  it("setKpis 写入", () => {
    setKpis({ upgradable: 3, latest: 5, error: 1, total: 11 });
    expect(kpis.value).toEqual({ upgradable: 3, latest: 5, error: 1, total: 11 });
    expect(kpis.value.upgradable).toBe(3);
  });

  it("setTrend 写入 7 天数据", () => {
    setTrend([1, 2, 3, 4, 5, 6, 7]);
    expect(trend.value).toHaveLength(7);
    expect(trend.value[6]).toBe(7);
  });

  it("setWatchlistQuick 写入", () => {
    setWatchlistQuick([{ name: "vscode", has_update: true }]);
    expect(watchlistQuick.value).toHaveLength(1);
    expect(watchlistQuick.value[0].name).toBe("vscode");
  });

  it("setRecentActivity 写入", () => {
    setRecentActivity([{ kind: "upgrade", appName: "vscode", ts: 123 }]);
    expect(recentActivity.value).toHaveLength(1);
    expect(recentActivity.value[0].kind).toBe("upgrade");
  });

  it("setAiInsights 写入", () => {
    setAiInsights({ status: "ready", text: "summary", fromCache: false });
    expect(aiInsights.value.status).toBe("ready");
    expect(aiInsights.value.text).toBe("summary");
    expect(aiInsights.value.fromCache).toBe(false);
  });

  it("resetOverview 回到默认", () => {
    setKpis({ upgradable: 9, latest: 9, error: 9, total: 9 });
    setTrend([1, 2, 3]);
    setWatchlistQuick([{ name: "x", has_update: true }]);
    setRecentActivity([{ kind: "x", appName: "y", ts: 1 }]);
    setAiInsights({ status: "ready", text: "t", fromCache: true });
    resetOverview();
    expect(kpis.value).toEqual({ upgradable: 0, latest: 0, error: 0, total: 0 });
    expect(trend.value).toEqual([]);
    expect(watchlistQuick.value).toEqual([]);
    expect(recentActivity.value).toEqual([]);
    expect(aiInsights.value).toEqual({ status: "idle", text: "", fromCache: false });
  });
});