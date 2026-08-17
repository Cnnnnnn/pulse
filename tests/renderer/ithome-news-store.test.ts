/**
 * tests/renderer/ithome-news-store.test.js
 *
 * 覆盖 ithome store 的 read/new 行为：
 * - markIthomeRead: signal 更新 + IPC 调用 + 从 newIds 移除 + 同步 article.readAt
 * - loadIthomeNews: diff 产生本次刷新新增的 newIds
 * - 切 viewMode / 切日期 / 切收藏日期 清空 newIds
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockMarkRead, mockLoadNews, mockFetchDay, mockShareCard, setLoadNewsPayload, resetLoadNewsMock } = vi.hoisted(() => {
  const mockMarkRead = vi.fn().mockResolvedValue({ ok: true });
  const mockFetchDay = vi.fn().mockResolvedValue({ ok: true });
  const queue = [];
  const mockLoadNews = vi.fn(() => {
    if (queue.length === 0) {
      return Promise.resolve({ ok: true, articles: {}, dayStats: {}, summaries: {}, favorites: {} });
    }
    return Promise.resolve(queue.shift());
  });
  const mockShareCard = vi.fn().mockResolvedValue({ ok: true, bytes: 1234 });
  const setLoadNewsPayload = (payload) => queue.push(payload);
  const resetLoadNewsMock = () => {
    mockMarkRead.mockClear();
    mockLoadNews.mockClear();
    mockFetchDay.mockReset();
    mockFetchDay.mockResolvedValue({ ok: true });
    mockShareCard.mockClear();
    queue.length = 0;
  };
  return { mockMarkRead, mockLoadNews, mockFetchDay, mockShareCard, setLoadNewsPayload, resetLoadNewsMock };
});

vi.mock("../../src/renderer/store/store-utils.ts", () => ({
  requireApiMethod: (name) => {
    if (name === "ithomeMarkRead") return mockMarkRead;
    if (name === "ithomeLoadNews") return mockLoadNews;
    if (name === "ithomeFetchDay") return mockFetchDay;
    if (name === "ithomeShareCard") return mockShareCard;
    return undefined;
  },
}));

vi.mock("../../src/renderer/recent/track.ts", () => ({
  trackIthomeView: () => {},
  trackIthomeFavorite: () => {},
  trackIthomeSummary: () => {},
}));

import {
  ithomeReadIds,
  ithomeNewIds,
  ithomeSharingIds,
  ithomeUnreadBadge,
  ithomeArticles,
  ithomeNewsLoading,
  ithomeNewsState,
  markIthomeRead,
  loadIthomeNews,
  fetchDayNews,
  refreshIthomeNews,
  setIthomeViewMode,
  setIthomeSelectedDate,
  setIthomeFavoriteSelectedDate,
  shareIthomeArticle,
} from "../../src/renderer/ithome/store.ts";

const ARTICLES_BEFORE = {
  a: { id: "a", title: "old A", dateKey: "2026-06-12" },
  b: { id: "b", title: "old B", dateKey: "2026-06-12" },
};

const ARTICLES_AFTER = {
  a: { id: "a", title: "old A", dateKey: "2026-06-12" },
  b: { id: "b", title: "old B", dateKey: "2026-06-12" },
  c: { id: "c", title: "new C", dateKey: "2026-06-12" },
  d: { id: "d", title: "new D", dateKey: "2026-06-12" },
};

function makeArticles(count, offset = 0) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const id = `article-${offset + index}`;
      return [id, { id, title: id, dateKey: "2026-06-12" }];
    }),
  );
}

describe("ithome store read/new flags", () => {
  beforeEach(() => {
    resetLoadNewsMock();
    ithomeReadIds.value = {};
    ithomeNewIds.value = {};
    ithomeArticles.value = {};
    ithomeNewsLoading.value = false;
    ithomeNewsState.value = { phase: "idle", data: {}, error: null, source: "unknown", fetchedAt: 0, lastAttemptAt: 0 };
  });

  it("markIthomeRead updates readIds signal and calls IPC", async () => {
    await markIthomeRead("x");
    expect(ithomeReadIds.value.x).toBeGreaterThan(0);
    expect(mockMarkRead).toHaveBeenCalledWith("x");
  });

  it("markIthomeRead removes id from newIds", async () => {
    ithomeNewIds.value = { x: 1, y: 1 };
    await markIthomeRead("x");
    expect(ithomeNewIds.value.x).toBeUndefined();
    expect(ithomeNewIds.value.y).toBe(1);
  });

  it("markIthomeRead updates article.readAt in cache", async () => {
    ithomeArticles.value = { x: { id: "x", title: "X" } };
    await markIthomeRead("x");
    expect(ithomeArticles.value.x.readAt).toBeGreaterThan(0);
  });

  it("loadIthomeNews diff → only the latest refresh additions remain new", async () => {
    setLoadNewsPayload({ ok: true, articles: ARTICLES_BEFORE, dayStats: {}, summaries: {}, favorites: {} });
    await loadIthomeNews({ trackNew: true });
    expect(ithomeNewIds.value.a).toBe(1);
    expect(ithomeNewIds.value.b).toBe(1);
    setLoadNewsPayload({ ok: true, articles: ARTICLES_AFTER, dayStats: {}, summaries: {}, favorites: {} });
    await loadIthomeNews({ trackNew: true });
    expect(ithomeNewIds.value.c).toBe(1);
    expect(ithomeNewIds.value.d).toBe(1);
    expect(ithomeNewIds.value.a).toBeUndefined();
    expect(ithomeNewIds.value.b).toBeUndefined();
  });

  it("真实连续刷新 135 → 146 → 146 时，只保留本次新增文章为 new", async () => {
    const firstRefresh = makeArticles(135);
    const secondRefresh = {
      ...firstRefresh,
      ...makeArticles(11, 135),
    };

    setLoadNewsPayload({ ok: true, articles: firstRefresh, dayStats: {}, summaries: {}, favorites: {} });
    await refreshIthomeNews();
    expect(Object.keys(ithomeArticles.value)).toHaveLength(135);
    expect(Object.keys(ithomeNewIds.value)).toHaveLength(135);

    setLoadNewsPayload({ ok: true, articles: secondRefresh, dayStats: {}, summaries: {}, favorites: {} });
    await refreshIthomeNews();
    expect(Object.keys(ithomeArticles.value)).toHaveLength(146);
    expect(Object.keys(ithomeNewIds.value)).toEqual(
      Array.from({ length: 11 }, (_, index) => `article-${135 + index}`),
    );

    setLoadNewsPayload({ ok: true, articles: secondRefresh, dayStats: {}, summaries: {}, favorites: {} });
    await refreshIthomeNews();
    expect(Object.keys(ithomeNewIds.value)).toEqual([]);
  });

  it("setIthomeViewMode clears newIds", () => {
    ithomeNewIds.value = { a: 1, b: 1 };
    setIthomeViewMode("favorites");
    expect(ithomeNewIds.value).toEqual({});
  });

  it("setIthomeSelectedDate clears newIds", () => {
    ithomeNewIds.value = { a: 1 };
    setIthomeSelectedDate("2026-06-11");
    expect(ithomeNewIds.value).toEqual({});
  });

  it("setIthomeFavoriteSelectedDate clears newIds", () => {
    ithomeNewIds.value = { a: 1 };
    setIthomeFavoriteSelectedDate("2026-06-11");
    expect(ithomeNewIds.value).toEqual({});
  });

  it("successful load enters ready state with live source", async () => {
    setLoadNewsPayload({ ok: true, articles: ARTICLES_BEFORE, dayStats: {}, summaries: {}, favorites: {}, ts: 123 });
    await loadIthomeNews();
    expect(ithomeNewsState.value.phase).toBe("ready");
    expect(ithomeNewsState.value.source).toBe("live");
    expect(ithomeNewsState.value.fetchedAt).toBe(123);
  });

  it("failed refresh keeps a usable cache as stale", async () => {
    setLoadNewsPayload({ ok: true, articles: ARTICLES_BEFORE, dayStats: {}, summaries: {}, favorites: {}, ts: 123 });
    await loadIthomeNews();
    mockFetchDay.mockResolvedValueOnce({ ok: false, reason: "network_failed" });
    await fetchDayNews("2026-06-12");
    expect(ithomeNewsState.value.phase).toBe("stale");
    expect(ithomeNewsState.value.fetchedAt).toBe(123);
    expect(Object.keys(ithomeArticles.value)).toEqual(["a", "b"]);
  });
});

describe("shareIthomeArticle", () => {
  beforeEach(() => {
    resetLoadNewsMock();
    ithomeSharingIds.value = {};
  });

  it("sets sharingIds[id]=true synchronously, clears on success", async () => {
    expect(ithomeSharingIds.value["a1"]).toBeFalsy();

    const p = shareIthomeArticle("a1");
    expect(ithomeSharingIds.value["a1"]).toBe(true);

    const r = await p;
    expect(r.ok).toBe(true);
    expect(ithomeSharingIds.value["a1"]).toBeFalsy();
  });

  it("clears sharingIds on failure", async () => {
    mockShareCard.mockResolvedValueOnce({ ok: false, reason: "no_summary" });
    const p = shareIthomeArticle("a2");
    expect(ithomeSharingIds.value["a2"]).toBe(true);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(ithomeSharingIds.value["a2"]).toBeFalsy();
  });
});

describe("ithomeUnreadBadge — SideNav 未读角标 (I6)", () => {
  beforeEach(() => {
    // ithomeNewIds 是 module-level signal, 跨 it 残留 — 每个 case 前显式清空
    ithomeNewIds.value = {};
  });

  it("空 newIds → 0", () => {
    expect(ithomeUnreadBadge.value).toBe(0);
  });

  it("newIds 有 3 个 id → 3", () => {
    ithomeNewIds.value = { a: 1, b: 1, c: 1 };
    expect(ithomeUnreadBadge.value).toBe(3);
  });

  it("删掉 1 个 id 后 → 数字 -1", () => {
    ithomeNewIds.value = { a: 1, b: 1, c: 1 };
    expect(ithomeUnreadBadge.value).toBe(3);
    const next = { ...ithomeNewIds.value };
    delete next.a;
    ithomeNewIds.value = next;
    expect(ithomeUnreadBadge.value).toBe(2);
  });
});
