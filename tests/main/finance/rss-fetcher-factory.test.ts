/**
 * tests/main/finance/rss-fetcher-factory.test.ts
 *
 * C1 验证：工厂 createRssFetcher 产出的 article 必须覆盖 FinArticle 全部字段
 * （id/source/sourceKey/title/summary/body/bodyFetchedAt/url/pubDate/dateKey/
 * category/tags/popularity/isRed/fetchedAt/readAt），且 postProcess 钩子生效。
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");
const { createRssFetcher } = requireMain("finance/rss-fetcher-factory");

const REQUIRED_KEYS = [
  "id",
  "source",
  "sourceKey",
  "title",
  "summary",
  "body",
  "bodyFetchedAt",
  "url",
  "pubDate",
  "dateKey",
  "category",
  "tags",
  "popularity",
  "isRed",
  "fetchedAt",
  "readAt",
];

function buildRss(n: number): string {
  const base = Date.parse("2026-07-27T12:00:00+08:00");
  let items = "";
  for (let i = 0; i < n; i++) {
    const d = new Date(base - i * 3600 * 1000).toUTCString();
    items +=
      `<item><title>财经新闻${i}</title><link>http://x.example/${i}</link>` +
      `<guid>g${i}</guid><pubDate>${d}</pubDate><description>摘要${i}</description></item>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

describe("rss-fetcher-factory · 产出 FinArticle 形状 (C1)", () => {
  it("normalize 产出含全部 FinArticle 字段的 article", () => {
    const f = createRssFetcher({ id: "t", label: "测试源", url: "http://x" });
    const out = f.normalize(buildRss(3));
    expect(out.length).toBe(3);
    const a = out[0];
    for (const k of REQUIRED_KEYS) expect(a).toHaveProperty(k);
    expect(Array.isArray(a.tags)).toBe(true);
    expect(typeof a.popularity).toBe("number");
    expect(typeof a.isRed).toBe("boolean");
    expect(a.id.startsWith("t:")).toBe(true);
  });

  it("postProcess 钩子生效（排序 + 裁剪）", () => {
    const f = createRssFetcher({
      id: "t",
      label: "测试源",
      url: "http://x",
      postProcess: (items: any[]) => items.slice(0, 1),
    });
    const out = f.normalize(buildRss(5));
    expect(out.length).toBe(1);
  });
});
