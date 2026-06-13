/**
 * tests/renderer/ithome-news-utils.test.js
 */

import { describe, it, expect } from "vitest";
import {
  shiftDateKey,
  canGoPrevDay,
  canGoNextDay,
  articlesForDate,
  favoriteDateKeys,
  favoritesForDate,
  shiftFavoriteDateKey,
  formatDateChip,
  weekdayShort,
  formatExcerptPreview,
  countSummarizedArticles,
  sidebarDayCount,
} from "../../src/renderer/ithome/news-utils.js";

const NOW = new Date("2026-06-12T12:00:00+08:00");

describe("ithome news-utils", () => {
  it("shiftDateKey moves within month", () => {
    expect(shiftDateKey("2026-06-12", -1, NOW)).toBe("2026-06-11");
    expect(shiftDateKey("2026-06-12", 1, NOW)).toBe("2026-06-12");
  });

  it("canGoPrevDay / canGoNextDay", () => {
    expect(canGoPrevDay("2026-06-01", NOW)).toBe(false);
    expect(canGoNextDay("2026-06-12", NOW)).toBe(false);
    expect(canGoPrevDay("2026-06-12", NOW)).toBe(true);
  });

  it("articlesForDate filters and sorts", () => {
    const articles = {
      a: {
        id: "a",
        dateKey: "2026-06-12",
        pubDate: "2026-06-12T10:00:00+08:00",
      },
      b: {
        id: "b",
        dateKey: "2026-06-11",
        pubDate: "2026-06-11T10:00:00+08:00",
      },
      c: {
        id: "c",
        dateKey: "2026-06-12",
        pubDate: "2026-06-12T20:00:00+08:00",
      },
    };
    const list = articlesForDate(articles, "2026-06-12");
    expect(list.map((x) => x.id)).toEqual(["c", "a"]);
  });

  it("favoriteDateKeys and favoritesForDate group by date", () => {
    const favorites = {
      a: {
        article: {
          id: "a",
          dateKey: "2026-05-20",
          pubDate: "2026-05-20T10:00:00+08:00",
        },
      },
      b: {
        article: {
          id: "b",
          dateKey: "2026-06-12",
          pubDate: "2026-06-12T18:00:00+08:00",
        },
      },
      c: {
        article: {
          id: "c",
          dateKey: "2026-06-12",
          pubDate: "2026-06-12T08:00:00+08:00",
        },
      },
    };
    expect(favoriteDateKeys(favorites)).toEqual(["2026-06-12", "2026-05-20"]);
    expect(favoritesForDate(favorites, "2026-06-12").map((x) => x.id)).toEqual([
      "b",
      "c",
    ]);
    expect(shiftFavoriteDateKey("2026-06-12", 1, favorites)).toBe("2026-05-20");
  });

  it("formatDateChip and formatExcerptPreview", () => {
    expect(formatDateChip("2026-06-12")).toBe("12日");
    expect(weekdayShort("2026-06-12")).toBe("五");
    expect(formatExcerptPreview("abc def", 5)).toBe("abc d…");
  });

  it("countSummarizedArticles counts entries with text", () => {
    const articles = [{ id: "a" }, { id: "b" }];
    const summaries = { a: { text: "ok" }, b: {} };
    expect(countSummarizedArticles(articles, summaries)).toBe(1);
  });

  it("sidebarDayCount prefers dayStats over cached articles", () => {
    const articles = {
      a: { id: "a", dateKey: "2026-06-08" },
    };
    const dayStats = {
      "2026-06-08": { count: 120, fetchedAt: 1 },
      "2026-06-10": { count: 0, fetchedAt: 1 },
    };
    expect(sidebarDayCount(dayStats, articles, "2026-06-08")).toBe(120);
    expect(sidebarDayCount(dayStats, articles, "2026-06-09")).toBe(0);
    expect(sidebarDayCount({}, articles, "2026-06-08")).toBe(1);
  });
});
