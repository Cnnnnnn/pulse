/**
 * tests/main/finance/news-store-prune.test.ts
 *
 * QA 验证：_pruneArticles 的全局上限（B2）。
 * 以前按"天"封顶 400/天且仅剔非当月，会让当月逐日累积到上万条。
 * 现改为按天切片后再做全局上限 FIN_ARTICLES_TOTAL_CAP 截断。
 * 用临时 state.json + mock aggregator（不触网）验证。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("../../../src/main/finance/aggregator", () => ({
  aggregateNews: vi.fn(),
}));

import * as store from "../../../src/main/finance/news-store";
import * as aggregator from "../../../src/main/finance/aggregator";
import * as financeFiles from "../../../src/main/finance/finance-files";
import { FIN_ARTICLES_TOTAL_CAP } from "../../../src/main/finance/config";

const aggMock = vi.mocked(aggregator.aggregateNews);

let tmp = "";

function mkItem(i: number, daysAgo: number): any {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pubDate = d.toISOString();
  const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    id: `eastmoney:${i}`,
    source: "t",
    sourceKey: "eastmoney",
    title: `新闻${i}`,
    summary: "",
    body: "",
    url: "",
    pubDate,
    dateKey,
    category: "股市",
    tags: [],
    popularity: 0,
    isRed: false,
    fetchedAt: Date.now(),
    readAt: 0,
  };
}

beforeEach(() => {
  tmp = path.join(
    os.tmpdir(),
    `finance-prune-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    "state.json",
  );
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  vi.clearAllMocks();
});

afterEach(() => {
  try {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("finance news-store · 全局裁剪上限 (B2)", () => {
  it("超过全局上限的文章被截断，且不超出 FIN_ARTICLES_TOTAL_CAP", async () => {
    const n = FIN_ARTICLES_TOTAL_CAP + 500;
    const items: any[] = [];
    for (let i = 0; i < n; i++) items.push(mkItem(i, i % 20));
    aggMock.mockResolvedValue({ items, errorsPerSource: {} });

    const r = await store.refresh(tmp, { force: true });
    expect(r.ok).toBe(true);

    const arts = JSON.parse(
      fs.readFileSync(financeFiles.newsFilePath(tmp), "utf-8"),
    ).articles;
    expect(Object.keys(arts).length).toBeLessThanOrEqual(FIN_ARTICLES_TOTAL_CAP);
    // 最新（daysAgo=0）的文章应被保留
    expect(arts["eastmoney:0"]).toBeTruthy();
  });

  it("未超上限时全部保留（回归：不会误删）", async () => {
    const n = Math.min(50, FIN_ARTICLES_TOTAL_CAP - 10);
    const items: any[] = [];
    for (let i = 0; i < n; i++) items.push(mkItem(i, i % 5));
    aggMock.mockResolvedValue({ items, errorsPerSource: {} });

    await store.refresh(tmp, { force: true });
    const arts = JSON.parse(
      fs.readFileSync(financeFiles.newsFilePath(tmp), "utf-8"),
    ).articles;
    expect(Object.keys(arts).length).toBe(n);
  });
});
