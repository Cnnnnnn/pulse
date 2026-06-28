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

// 30 个 mock 交易日 K 线, 价格从 100 线性涨到 130 (close[i] = 100 + i/(n-1) * 30)
// open=close-0.5, high=close+1, low=close-1, volume(amount)=1e9+i*1e7
function makeLinearKlines(n = 30) {
  return Array.from({ length: n }, (_, i) => {
    const close = 100 + (i / (n - 1)) * 30;
    return `2026-05-${String(i + 1).padStart(2, "0")},${close - 0.5},${close},${close + 1},${close - 1},${1e9 + i * 1e7},${1e9 + i * 1e7},0`;
  });
}

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

describe("fetchPriceTrend — klines + lastQuote 增量字段", () => {
  it("summarize 后 data.klines 保留 30 根 OHLC + volume + amplitude", async () => {
    const http = makeClient([emResponse(makeLinearKlines(30))]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.klines).toBeDefined();
    expect(r.data.klines).toHaveLength(30);
    expect(r.data.klines[0]).toEqual({
      date: "2026-05-01",
      open: expect.any(Number),
      high: expect.any(Number),
      low: expect.any(Number),
      close: expect.any(Number),
      volume: expect.any(Number), // volume = amount (eastmoney kline field 6)
      amplitude: expect.any(Number),
    });
    expect(r.data.klines[29].close).toBeGreaterThan(r.data.klines[0].close);
  });

  it("lastQuote 推算最后一根 vs 倒数第二根", async () => {
    const http = makeClient([emResponse(makeLinearKlines(30))]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(true);
    const last = r.data.klines[r.data.klines.length - 1].close;
    const prev = r.data.klines[r.data.klines.length - 2].close;
    const expectedChange = last - prev;
    const expectedChangePct = (expectedChange / prev) * 100;
    expect(r.data.lastQuote).toEqual({
      price: last,
      change: expectedChange,
      changePct: expect.closeTo(expectedChangePct, 2),
    });
  });

  it("老契约 closes/change5d/change20d/amplitude 字段值不变", async () => {
    const http = makeClient([emResponse(makeLinearKlines(30))]);
    const r = await fetchPriceTrend(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.closes).toHaveLength(30);
    expect(typeof r.data.change5d).toBe("number");
    expect(typeof r.data.change20d).toBe("number");
    expect(typeof r.data.amplitude).toBe("number");
  });

  it("K 线 < 2 根时 lastQuote 为 null", async () => {
    // 空 klines: 走 fetch_failed / parse_failed 路径, ok=false, lastQuote 不存在
    const http = makeClient([emResponse([])]);
    const r = await fetchPriceTrend(http, { code: "000001" });
    expect(r.ok).toBe(false);
  });
});
