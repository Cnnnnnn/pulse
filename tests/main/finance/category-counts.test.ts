/**
 * tests/main/finance/category-counts.test.ts
 *
 * E2 验证：getCategoryCounts 基于全量 articles 统计各分类计数（含「全部」），
 * 不随当前分类/搜索过滤变化；空库返回全 0。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const { requireMain } = require("../../_setup/require-main.cjs");
const files = requireMain("finance/finance-files");
const store = requireMain("finance/news-store");

let tmp: string;

beforeEach(() => {
  tmp = path.join(
    os.tmpdir(),
    `finance-cat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    "state.json",
  );
});

afterEach(() => {
  for (const f of [tmp, files.newsFilePath(tmp)]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* noop */
    }
  }
  try {
    fs.rmdirSync(path.dirname(tmp));
  } catch {
    /* noop */
  }
});

function mkArt(id: string, cat: string): any {
  return {
    id,
    source: "t",
    sourceKey: id.split(":")[0],
    title: id,
    summary: "",
    body: "",
    bodyFetchedAt: 0,
    url: "",
    pubDate: "2026-07-27T09:00:00+08:00",
    dateKey: "2026-07-27",
    category: cat,
    tags: [],
    popularity: 0,
    isRed: false,
    fetchedAt: Date.now(),
    readAt: 0,
  };
}

describe("news-store getCategoryCounts (E2)", () => {
  it("统计全量各分类计数 + 全部", () => {
    const articles: Record<string, any> = {
      "eastmoney:1": mkArt("eastmoney:1", "股市"),
      "eastmoney:2": mkArt("eastmoney:2", "股市"),
      "stats:1": mkArt("stats:1", "宏观"),
      "wallstreetcn:1": mkArt("wallstreetcn:1", "全球"),
    };
    files.writeNewsState({ ts: Date.now(), articles, favorites: {} }, tmp);
    const counts = store.getCategoryCounts(tmp);
    expect(counts.all).toBe(4);
    expect(counts["股市"]).toBe(2);
    expect(counts["宏观"]).toBe(1);
    expect(counts["全球"]).toBe(1);
    // 未出现的分类计数为 0
    expect(counts["基金"]).toBe(0);
    expect(counts["债券"]).toBe(0);
  });

  it("空库返回全 0", () => {
    files.writeNewsState({ ts: Date.now(), articles: {}, favorites: {} }, tmp);
    const counts = store.getCategoryCounts(tmp);
    expect(counts.all).toBe(0);
    expect(counts["股市"]).toBe(0);
  });

  it("缺分类字段的文章只计入全部，不影响具体分类", () => {
    const articles: Record<string, any> = {
      "x:1": { ...mkArt("x:1", "股市"), category: undefined },
    };
    files.writeNewsState({ ts: Date.now(), articles, favorites: {} }, tmp);
    const counts = store.getCategoryCounts(tmp);
    expect(counts.all).toBe(1);
    expect(counts["股市"]).toBe(0);
  });
});
