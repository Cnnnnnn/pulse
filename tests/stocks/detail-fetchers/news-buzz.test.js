/**
 * tests/stocks/detail-fetchers/news-buzz.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchNewsBuzz } from "../../../src/stocks/detail-fetchers/news-buzz.js";

const emOK = (list) => ({ ok: true, status: 200, body: { data: { list } } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchNewsBuzz", () => {
  it("parses eastmoney news list with sentiment", async () => {
    const items = [
      { title: "股价突破新高", date: "2026-06-25" },
      { title: "公司公告", date: "2026-06-24" },
      { title: "利空消息引发下跌", date: "2026-06-23" },
    ];
    const http = makeClient([emOK(items)]);
    const r = await fetchNewsBuzz(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.items).toHaveLength(3);
    expect(r.data.items[0].sentiment).toBe("positive");
    expect(r.data.items[1].sentiment).toBe("neutral");
    expect(r.data.items[2].sentiment).toBe("negative");
  });

  it("em returns empty data → falls through to sina with empty items", async () => {
    // ponytail: em 接口 2026 改版常返 data:null/{}; fetcher 视为"该源无数据",
    // 不再报 parse_failed, 而是继续走 sina. sina 也空 → ok with empty items.
    const http = makeClient([
      {
        ok: true,
        status: 200,
        body: { code: 1, message: "success", data: null },
      },
      {
        ok: true,
        status: 200,
        body: { result: { status: { code: 11 }, data: [] } },
      },
    ]);
    const r = await fetchNewsBuzz(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.items).toEqual([]);
  });

  it("falls back to sina on primary network failure", async () => {
    const http = makeClient([
      fail(),
      {
        ok: true,
        status: 200,
        body: {
          result: { data: [{ title: "利好公告", ctime: "2026-06-25" }] },
        },
      },
    ]);
    const r = await fetchNewsBuzz(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.items[0].sentiment).toBe("positive");
  });

  it("both sources empty 200 → ok with empty items (no fetch_failed)", async () => {
    // ponytail: 舆情数据缺失是合理结果, 不算 fetch 失败.
    const http = makeClient([
      { ok: true, status: 200, body: { data: null } },
      { ok: true, status: 200, body: { result: { data: [] } } },
    ]);
    const r = await fetchNewsBuzz(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.items).toEqual([]);
  });
});
