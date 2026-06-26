/**
 * tests/stocks/detail-fetchers/volume-turnover.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchVolumeTurnover } from "../../../src/stocks/detail-fetchers/volume-turnover.js";

const emOK = (klines) => ({ ok: true, status: 200, body: { data: { klines } } });
const sinaOK = (items) => ({ ok: true, status: 200, body: items });
const fail = (status = 500) => ({ ok: false, status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

const kline = (date, c) => `${date},${c + 1},${c},${c - 1},${c + 2},1000,${c * 100000},${c * 0.1}`;

beforeEach(() => vi.restoreAllMocks());

describe("fetchVolumeTurnover", () => {
  it("computes avg/latest amount + turnover from eastmoney", async () => {
    const klines = Array.from({ length: 30 }, (_, i) => kline(`2026-05-${(i + 1).toString().padStart(2, "0")}`, 10 + i));
    const http = makeClient([emOK(klines)]);
    const r = await fetchVolumeTurnover(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.latestAmount).toBe(39 * 100000);
    expect(r.data.avgAmount30d).toBeGreaterThan(0);
    expect(typeof r.data.latestTurnover).toBe("number");
    expect(typeof r.data.avgTurnover30d).toBe("number");
  });

  it("parse_failed when klines missing", async () => {
    const http = makeClient([{ ok: true, status: 200, body: { data: {} } }]);
    const r = await fetchVolumeTurnover(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina on primary failure", async () => {
    const klines = Array.from({ length: 30 }, (_, i) => kline(`2026-05-${(i + 1).toString().padStart(2, "0")}`, 10 + i));
    const sinaBody = klines.map((csv) => {
      const parts = csv.split(",");
      return { day: parts[0], open: +parts[1], close: +parts[2], high: +parts[3], low: +parts[4], amount: +parts[6], turnover: +parts[7] };
    });
    const http = makeClient([fail(500), sinaOK(sinaBody)]);
    const r = await fetchVolumeTurnover(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(500), fail(503)]);
    const r = await fetchVolumeTurnover(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});