/**
 * tests/renderer/ithome-news-store.test.js
 *
 * 覆盖 ithome store 的 read/new 行为：
 * - markIthomeRead: signal 更新 + IPC 调用 + 从 newIds 移除 + 同步 article.readAt
 * - loadIthomeNews: diff 产生 newIds (仅追踪本 session 首次出现的 id)
 * - 切 viewMode / 切日期 / 切收藏日期 清空 newIds
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockMarkRead, mockLoadNews, mockShareCard, mockFetchComments, setLoadNewsPayload, resetLoadNewsMock } = vi.hoisted(() => {
  const mockMarkRead = vi.fn().mockResolvedValue({ ok: true });
  const queue = [];
  const mockLoadNews = vi.fn(() => {
    if (queue.length === 0) {
      return Promise.resolve({ ok: true, articles: {}, dayStats: {}, summaries: {}, favorites: {} });
    }
    return Promise.resolve(queue.shift());
  });
  const mockShareCard = vi.fn().mockResolvedValue({ ok: true, bytes: 1234 });
  const mockFetchComments = vi.fn();
  const setLoadNewsPayload = (payload) => queue.push(payload);
  const resetLoadNewsMock = () => {
    mockMarkRead.mockClear();
    mockLoadNews.mockClear();
    mockShareCard.mockClear();
    mockFetchComments.mockClear();
    queue.length = 0;
  };
  return { mockMarkRead, mockLoadNews, mockShareCard, mockFetchComments, setLoadNewsPayload, resetLoadNewsMock };
});

vi.mock("../../src/renderer/store-utils.js", () => ({
  requireApiMethod: (name) => {
    if (name === "ithomeMarkRead") return mockMarkRead;
    if (name === "ithomeLoadNews") return mockLoadNews;
    if (name === "ithomeShareCard") return mockShareCard;
    if (name === "ithomeFetchComments") return mockFetchComments;
    return undefined;
  },
}));

vi.mock("../../src/renderer/recent/track.js", () => ({
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
  markIthomeRead,
  loadIthomeNews,
  setIthomeViewMode,
  setIthomeSelectedDate,
  setIthomeFavoriteSelectedDate,
  shareIthomeArticle,
  ithomeComments,
  fetchIthomeComments,
} from "../../src/renderer/ithome/store.js";

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

describe("ithome store read/new flags", () => {
  beforeEach(() => {
    resetLoadNewsMock();
    ithomeReadIds.value = {};
    ithomeNewIds.value = {};
    ithomeArticles.value = {};
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

  it("loadIthomeNews diff → newIds gets ids seen for the first time this session", async () => {
    setLoadNewsPayload({ ok: true, articles: ARTICLES_BEFORE, dayStats: {}, summaries: {}, favorites: {} });
    await loadIthomeNews();
    expect(ithomeNewIds.value.a).toBe(1);
    expect(ithomeNewIds.value.b).toBe(1);
    setLoadNewsPayload({ ok: true, articles: ARTICLES_AFTER, dayStats: {}, summaries: {}, favorites: {} });
    await loadIthomeNews();
    expect(ithomeNewIds.value.c).toBe(1);
    expect(ithomeNewIds.value.d).toBe(1);
    expect(ithomeNewIds.value.a).toBe(1);
    expect(ithomeNewIds.value.b).toBe(1);
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
});

describe("ithome comments", () => {
  beforeEach(() => {
    mockFetchComments.mockReset();
    ithomeComments.value = {};
  });

  it("calls IPC once and caches returned comments", async () => {
    const comments = [
      { id: "1", author: "用户", content: "内容", createdAt: "时间", likes: 3 },
    ];
    mockFetchComments.mockResolvedValue({ ok: true, comments });

    const result = await fetchIthomeComments("article-1");

    expect(result.comments).toEqual(comments);
    expect(mockFetchComments).toHaveBeenCalledWith({ id: "article-1" });
    expect(ithomeComments.value["article-1"]).toEqual(comments);
  });

  it("does not call IPC again after a successful empty result", async () => {
    mockFetchComments.mockResolvedValue({ ok: true, comments: [] });
    await fetchIthomeComments("article-empty");
    await fetchIthomeComments("article-empty");
    expect(mockFetchComments).toHaveBeenCalledTimes(1);
    expect(ithomeComments.value["article-empty"]).toEqual([]);
  });

  it("returns failure without changing cached comments", async () => {
    ithomeComments.value = { "article-1": [{ id: "old" }] };
    mockFetchComments.mockResolvedValue({ ok: false, reason: "fetch_failed" });

    const result = await fetchIthomeComments("article-2");

    expect(result.ok).toBe(false);
    expect(ithomeComments.value["article-1"]).toEqual([{ id: "old" }]);
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
