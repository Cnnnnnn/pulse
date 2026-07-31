/**
 * tests/main/finance/news-store-refresh.test.ts
 *
 * QA 独立验证：news-store.refresh 的 stats 6h 节流（_statsStale）。
 * vi.mock aggregator（不触网），用临时 finance_news.json 验证（B1 后财经独立落盘）：
 *   - 已有 stats 文章 <6h → 不重新拉取 stats（保留旧 stats 文章，不再加新 stats 项）
 *   - force=true 或 stats 文章 >6h（stale）→ 重新拉取 stats
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

const aggMock = vi.mocked(aggregator.aggregateNews);

let tmp = "";

function mkItem(id: string, title: string, cat: string, fetchedAt: number): any {
  return {
    id,
    source: "t",
    sourceKey: id.split(":")[0],
    title,
    summary: "",
    body: "",
    url: "",
    pubDate: "2026-07-27T09:00:00+08:00",
    dateKey: "2026-07-27",
    category: cat,
    tags: [],
    popularity: 0,
    isRed: false,
    fetchedAt,
    readAt: 0,
  };
}

function seed(articles: Record<string, any>): void {
  fs.writeFileSync(
    financeFiles.newsFilePath(tmp),
    JSON.stringify({
      ts: Date.now(),
      articles,
      favorites: {},
    }),
  );
}

function readArticles(): Record<string, any> {
  const j = JSON.parse(fs.readFileSync(financeFiles.newsFilePath(tmp), "utf-8"));
  return j.articles;
}

const HOUR = 3600 * 1000;
const now = Date.now();

beforeEach(() => {
  tmp = path.join(
    os.tmpdir(),
    `finance-refresh-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    "state.json",
  );
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  vi.clearAllMocks();
  // aggregator 按 sources 开关返回不同 items，便于判定 stats 是否真被拉取
  aggMock.mockImplementation(async (opts: any) => {
    const src = (opts && opts.sources) || {};
    const items: any[] = [];
    if (src.eastmoney) items.push(mkItem("eastmoney:1", "股市新闻", "股市", now));
    if (src.wallstreetcn)
      items.push(mkItem("wallstreetcn:1", "全球市场", "全球", now));
    if (src.stats) items.push(mkItem("stats:1", "宏观数据", "宏观", now));
    return { items, errorsPerSource: {} };
  });
});

afterEach(() => {
  try {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("finance news-store.refresh · stats 6h 节流 (QA 补充)", () => {
  it("已有 stats 文章 <6h（新鲜）→ 不重新拉取 stats，旧 stats 文章保留", async () => {
    seed({ "stats:seed": mkItem("stats:seed", "旧宏观", "宏观", now - 1 * HOUR) });
    const r = await store.refresh(tmp, {});
    expect(r.ok).toBe(true);
    const arts = readArticles();
    // 旧 stats 文章保留
    expect(arts["stats:seed"]).toBeTruthy();
    // 未触发 stats 拉取 → 不应出现新 stats:1
    expect(arts["stats:1"]).toBeUndefined();
    // 其它源照常拉取
    expect(arts["eastmoney:1"]).toBeTruthy();
    expect(arts["wallstreetcn:1"]).toBeTruthy();
  });

  it("stats 文章 >6h（stale）→ 重新拉取 stats（stats:1 出现）", async () => {
    seed({ "stats:seed": mkItem("stats:seed", "旧宏观", "宏观", now - 7 * HOUR) });
    await store.refresh(tmp, {});
    const arts = readArticles();
    expect(arts["stats:1"]).toBeTruthy(); // 重新拉到
    expect(arts["stats:seed"]).toBeTruthy(); // 旧文仍保留（id 不同）
  });

  it("force=true → 无视新鲜度，强制重新拉取 stats", async () => {
    seed({ "stats:seed": mkItem("stats:seed", "旧宏观", "宏观", now - 1 * HOUR) });
    await store.refresh(tmp, { force: true });
    const arts = readArticles();
    expect(arts["stats:1"]).toBeTruthy();
  });

  it("无 stats 文章 → _statsStale 返回 true，首次拉取 stats", async () => {
    seed({ "eastmoney:seed": mkItem("eastmoney:seed", "股市", "股市", now) });
    await store.refresh(tmp, {});
    const arts = readArticles();
    expect(arts["stats:1"]).toBeTruthy();
  });

  it("refresh 返回 ok 且 errorsPerSource 透传", async () => {
    aggMock.mockResolvedValueOnce({
      items: [mkItem("eastmoney:1", "x", "股市", now)],
      errorsPerSource: { wallstreetcn: "boom" },
    });
    const r = await store.refresh(tmp, {});
    expect(r.ok).toBe(true);
    expect(r.errorsPerSource.wallstreetcn).toBe("boom");
    expect(r.added).toBe(1);
    expect(typeof r.total).toBe("number");
  });
});
