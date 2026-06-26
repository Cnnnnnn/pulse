/**
 * tests/stocks/detail-fetchers/price-trend.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPriceTrend } from "../../../src/stocks/detail-fetchers/price-trend.js";

const emResponse = (klines) => ({ ok: true, status: 200, body: { data: { klines } } });
const fail = (status = 500) => ({ ok: false, status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

const kline = (date, c) => `${date},${c + 1},${c},${c - 1},${c + 2},1000,10000,0.5`;

beforeEach(() => vi.restoreAllMocks());

describe("fetchPriceTrend", () => {
  it("parses eastmoney kline response", async () => {
    const closes = Array.from({ length: 30 }, (_, i) => 10 + i);
    const klines = closes.map((c, i) => kline(`2026-05-${(i + 1).toString().padStart(2, "0")}`, c));
    const http = makeClient([emResponse(klines)]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.closes).toEqual(closes);
    expect(typeof r.data.change5d).toBe("number");
    expect(typeof r.data.change20d).toBe("number");
    expect(typeof r.data.amplitude).toBe("number");
  });

  it("returns parse_failed when eastmoney body shape wrong", async () => {
    const http = makeClient([{ ok: true, status: 200, body: { data: {} } }]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina when eastmoney fails", async () => {
    const http = makeClient([
      fail(500),
      { ok: true, status: 200, body: [
        { day: "2026-05-01", open: 10, close: 11, high: 12, low: 9, amount: 10000, turnover: 0.5 },
        { day: "2026-05-02", open: 11, close: 12, high: 13, low: 10, amount: 11000, turnover: 0.5 },
      ] },
    ]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it("returns fetch_failed when both sources fail", async () => {
    const http = makeClient([fail(500), fail(503)]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
