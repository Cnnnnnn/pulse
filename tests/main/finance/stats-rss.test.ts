/**
 * tests/main/finance/stats-rss.test.ts
 *
 * QA 独立验证：国家统计局 RSS 大体积裁剪。
 * normalize 按 pubDate 倒序裁剪到 STATS_MAX_ITEMS(200)。
 * 复用 ithome/rss-parser 解析真实 RSS XML（不触网）。
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");
const stats = requireMain("finance/fetcher-stats-rss");
const { normalize } = stats;

function buildRss(n: number): string {
  const base = Date.parse("2026-07-27T12:00:00+08:00");
  let items = "";
  for (let i = 0; i < n; i++) {
    // i=0 最新，i 越大越旧
    const d = new Date(base - i * 3600 * 1000).toUTCString();
    items +=
      `<item><title>统计新闻${i}</title><link>http://stats.example/${i}</link>` +
      `<guid>g${i}</guid><pubDate>${d}</pubDate><description>摘要${i}</description></item>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

describe("finance fetcher-stats-rss · 大体积裁剪 (QA 补充)", () => {
  it("300 条归一化后裁剪到 200 条", () => {
    const out = normalize(buildRss(300));
    expect(out.length).toBe(200);
  });

  it("裁剪后按 pubDate 倒序，且第 0 条为最新", () => {
    const out = normalize(buildRss(300));
    expect(out[0].title).toBe("统计新闻0");
    expect(out[199].title).toBe("统计新闻199");
    const times = out.map((a: any) => Date.parse(a.pubDate) || 0);
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
    }
  });

  it("不足 200 条时不裁剪", () => {
    const out = normalize(buildRss(50));
    expect(out.length).toBe(50);
  });

  it("归一化产物带 stats 源标识与派生分类（默认宏观）", () => {
    const out = normalize(buildRss(10));
    expect(out[0].sourceKey).toBe("stats");
    expect(out[0].category).toBe("宏观");
    expect(out[0].id.startsWith("stats:")).toBe(true);
  });
});
