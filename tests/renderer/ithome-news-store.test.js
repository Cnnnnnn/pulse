/**
 * tests/renderer/ithome-news-store.test.js
 *
 * 覆盖 ithome store 的 read/new 行为：
 * - markIthomeRead: signal 更新 + IPC 调用 + 从 newIds 移除 + 同步 article.readAt
 * - loadIthomeNews: diff 产生 newIds (仅追踪本 session 首次出现的 id)
 * - 切 viewMode / 切日期 / 切收藏日期 清空 newIds
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockMarkRead, mockLoadNews, setLoadNewsPayload, resetLoadNewsMock } = vi.hoisted(() => {
  const mockMarkRead = vi.fn().mockResolvedValue({ ok: true });
  const queue = [];
  const mockLoadNews = vi.fn(() => {
    if (queue.length === 0) {
      return Promise.resolve({ ok: true, articles: {}, dayStats: {}, summaries: {}, favorites: {} });
    }
    return Promise.resolve(queue.shift());
  });
  const setLoadNewsPayload = (payload) => queue.push(payload);
  const resetLoadNewsMock = () => {
    mockMarkRead.mockClear();
    mockLoadNews.mockClear();
    queue.length = 0;
  };
  return { mockMarkRead, mockLoadNews, setLoadNewsPayload, resetLoadNewsMock };
});

vi.mock("../../src/renderer/store-utils.js", () => ({
  requireApiMethod: (name) => {
    if (name === "ithomeMarkRead") return mockMarkRead;
    if (name === "ithomeLoadNews") return mockLoadNews;
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
  ithomeArticles,
  markIthomeRead,
  loadIthomeNews,
  setIthomeViewMode,
  setIthomeSelectedDate,
  setIthomeFavoriteSelectedDate,
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
