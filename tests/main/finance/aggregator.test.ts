/**
 * tests/main/finance/aggregator.test.ts
 *
 * QA 独立验证：单源失败隔离。
 * 直接 import 源 TS（vitest esbuild 转译），用 vi.mock 替换三个 RSS fetcher，
 * 不触网，验证「某源抛错/返回 ok:false 时，其余源正常、errorsPerSource 含该源」。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/main/finance/fetcher-eastmoney-rss", () => ({
  fetch: vi.fn(),
  normalize: vi.fn((raw: any) => (raw && raw.items) || []),
}));
vi.mock("../../../src/main/finance/fetcher-wallstreetcn-rss", () => ({
  fetch: vi.fn(),
  normalize: vi.fn((raw: any) => (raw && raw.items) || []),
}));
vi.mock("../../../src/main/finance/fetcher-stats-rss", () => ({
  fetch: vi.fn(),
  normalize: vi.fn((raw: any) => (raw && raw.items) || []),
}));

import { aggregateNews } from "../../../src/main/finance/aggregator";
import * as em from "../../../src/main/finance/fetcher-eastmoney-rss";
import * as wsc from "../../../src/main/finance/fetcher-wallstreetcn-rss";
import * as stats from "../../../src/main/finance/fetcher-stats-rss";

const emFetch = vi.mocked(em.fetch);
const wscFetch = vi.mocked(wsc.fetch);
const statsFetch = vi.mocked(stats.fetch);

function mkItem(id: string, title: string, cat: string): any {
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
    fetchedAt: Date.now(),
    readAt: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  emFetch.mockResolvedValue({
    ok: true,
    raw: { items: [mkItem("eastmoney:1", "股市新闻", "股市")] },
  });
  wscFetch.mockResolvedValue({
    ok: true,
    raw: { items: [mkItem("wallstreetcn:1", "全球市场", "全球")] },
  });
  statsFetch.mockResolvedValue({
    ok: true,
    raw: { items: [mkItem("stats:1", "宏观数据", "宏观")] },
  });
});

describe("finance aggregator · 单源失败隔离", () => {
  it("全部成功：items 合并、errorsPerSource 为空", async () => {
    const r = await aggregateNews();
    expect(r.errorsPerSource).toEqual({});
    expect(r.items.map((i: any) => i.id)).toEqual([
      "eastmoney:1",
      "wallstreetcn:1",
      "stats:1",
    ]);
  });

  it("某一源 fetch 抛异常：该源进 errorsPerSource，其余源正常返回", async () => {
    emFetch.mockRejectedValue(new Error("eastmoney boom"));
    const r = await aggregateNews();
    expect(r.errorsPerSource.eastmoney).toContain("eastmoney boom");
    expect(r.errorsPerSource.wallstreetcn).toBeUndefined();
    expect(r.errorsPerSource.stats).toBeUndefined();
    expect(r.items.map((i: any) => i.id)).toEqual([
      "wallstreetcn:1",
      "stats:1",
    ]);
  });

  it("某一源返回 ok:false：记错误，不污染其余源", async () => {
    wscFetch.mockResolvedValue({ ok: false, error: "http_500" });
    const r = await aggregateNews();
    expect(r.errorsPerSource.wallstreetcn).toBe("http_500");
    expect(r.items.map((i: any) => i.id)).toEqual([
      "eastmoney:1",
      "stats:1",
    ]);
  });

  it("sources 开关生效：关闭的源不被调用", async () => {
    const r = await aggregateNews({
      sources: { eastmoney: true, wallstreetcn: false, stats: false },
    });
    expect(wscFetch).not.toHaveBeenCalled();
    expect(statsFetch).not.toHaveBeenCalled();
    expect(r.items.map((i: any) => i.id)).toEqual(["eastmoney:1"]);
  });

  it("多源同时失败：errorsPerSource 含全部失败源", async () => {
    emFetch.mockRejectedValue(new Error("a"));
    statsFetch.mockResolvedValue({ ok: false, error: "b" });
    const r = await aggregateNews();
    expect(Object.keys(r.errorsPerSource).sort()).toEqual([
      "eastmoney",
      "stats",
    ]);
    expect(r.items.map((i: any) => i.id)).toEqual(["wallstreetcn:1"]);
  });
});
