// @vitest-environment happy-dom
/**
 * tests/renderer/finance/financeStore.test.ts
 *
 * Renderer store 行为测试（happy-dom）：过滤参数透传、刷新成功/失败、收藏/已读乐观更新。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../../../src/renderer/api.ts";
import * as store from "../../../src/renderer/finance/financeStore.ts";

const SAMPLE = [
  {
    id: "eastmoney:1",
    title: "t",
    category: "股市",
    tags: ["降准"],
    source: "东方财富",
    pubDate: "2026-07-27T09:00:00+08:00",
    isFavorited: false,
    readAt: 0,
  },
];

describe("finance store (renderer)", () => {
  beforeEach(() => {
    store.financeCategory.value = "all";
    store.financeSort.value = "time";
    store.financeSearch.value = "";
    store.financeList.value = [];
    store.financeNewsState.value = {
      phase: "idle",
      data: [],
      error: null,
      source: "unknown",
      fetchedAt: 0,
      lastAttemptAt: 0,
    };
    store.financeLoading.value = false;
    store.financeError.value = null;
    store.financeSelectedId.value = null;
    vi.restoreAllMocks();
  });

  it("applyNewsFilters: 写入列表 + 透传过滤参数", async () => {
    (api as any).financeGetNews = vi.fn(() => Promise.resolve(SAMPLE));
    store.applyNewsFilters("");
    expect(store.financeLoading.value).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect((api as any).financeGetNews).toHaveBeenCalledWith({
      category: "all",
      sort: "time",
      search: "",
    });
    expect(store.financeList.value).toEqual(SAMPLE);
    expect(store.financeNewsState.value.phase).toBe("ready");
    expect(store.financeNewsState.value.source).toBe("cache");
    expect(store.financeLoading.value).toBe(false);
  });

  it("applyNewsFilters: 分类/排序/搜索随信号变化", async () => {
    (api as any).financeGetNews = vi.fn(() => Promise.resolve([]));
    store.financeCategory.value = "宏观";
    store.financeSort.value = "popularity";
    store.applyNewsFilters("央行");
    await new Promise((r) => setTimeout(r, 0));
    expect((api as any).financeGetNews).toHaveBeenCalledWith({
      category: "宏观",
      sort: "popularity",
      search: "央行",
    });
  });

  it("refreshFinanceNews: 成功路径触发 get-news 重载", async () => {
    (api as any).financeRefreshNews = vi.fn(() => Promise.resolve({ ok: true }));
    (api as any).financeGetNews = vi.fn(() => Promise.resolve([]));
    const ok = await store.refreshFinanceNews();
    expect(ok).toBe(true);
    expect((api as any).financeRefreshNews).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect((api as any).financeGetNews).toHaveBeenCalled();
    expect(store.financeNewsState.value.source).toBe("live");
  });

  it("refreshFinanceNews: 失败置错误且不重载", async () => {
    (api as any).financeRefreshNews = vi.fn(() =>
      Promise.resolve({ ok: false, reason: "fetch_failed" }),
    );
    (api as any).financeGetNews = vi.fn(() => Promise.resolve([]));
    const ok = await store.refreshFinanceNews();
    expect(ok).toBe(false);
    expect(store.financeError.value).toBe("fetch_failed");
    expect(store.financeNewsState.value.phase).toBe("error");
    await new Promise((r) => setTimeout(r, 0));
    expect((api as any).financeGetNews).not.toHaveBeenCalled();
  });

  it("refreshFinanceNews: 失败时保留已有列表并标记 stale", async () => {
    store.financeList.value = SAMPLE;
    store.financeNewsState.value = {
      phase: "ready",
      data: SAMPLE,
      error: null,
      source: "live",
      fetchedAt: 100,
      lastAttemptAt: 100,
    };
    (api as any).financeRefreshNews = vi.fn(() =>
      Promise.resolve({ ok: false, reason: "network_failed" }),
    );
    const ok = await store.refreshFinanceNews();
    expect(ok).toBe(false);
    expect(store.financeNewsState.value.phase).toBe("stale");
    expect(store.financeList.value).toEqual(SAMPLE);
  });

  it("toggleFinanceFavorite: 乐观更新 isFavorited", async () => {
    (api as any).financeToggleFavorite = vi.fn(() =>
      Promise.resolve({ ok: true, favorited: true }),
    );
    store.financeList.value = [{ id: "eastmoney:1", isFavorited: false }];
    await store.toggleFinanceFavorite("eastmoney:1");
    expect(store.financeList.value[0].isFavorited).toBe(true);
  });

  it("markFinanceRead: 乐观更新 readAt", async () => {
    (api as any).financeMarkRead = vi.fn(() => Promise.resolve({ ok: true }));
    store.financeList.value = [{ id: "eastmoney:1", readAt: 0 }];
    await store.markFinanceRead("eastmoney:1");
    expect(store.financeList.value[0].readAt).toBeGreaterThan(0);
  });
});
