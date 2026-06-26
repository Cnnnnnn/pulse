/**
 * tests/stocks/detail-fetchers/tech-indicators.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTechIndicators } from "../../../src/stocks/detail-fetchers/tech-indicators.js";

const emOK = (closes) => ({ ok: true, status: 200, body: { data: { klines: closes.map((c, i) => `2026-05-${(i+1).toString().padStart(2,"0")},${c},${c},${c},${c},1000,10000,0.5`) } } });  // 模板: open, close, high, low — close=c 让 parsed closes == closes
const sinaOK = (closes) => ({ ok: true, status: 200, body: closes.map((c, i) => ({ day: `2026-05-${(i+1).toString().padStart(2,"0")}`, open: c, close: c, high: c, low: c, amount: 10000, turnover: 0.5 })) });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchTechIndicators", () => {
  it("computes MA5/10/20 from eastmoney klines", async () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const http = makeClient([emOK(closes)]);
    const r = await fetchTechIndicators(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.ma5).toBeCloseTo(127, 0);   // mean(125..129)
    expect(r.data.ma10).toBeCloseTo(124.5, 0); // mean(120..129)
    expect(r.data.ma20).toBeCloseTo(119.5, 0); // mean(110..129)
    expect(typeof r.data.macdHist).toBe("number");
  });

  it("parse_failed when insufficient data", async () => {
    const http = makeClient([emOK([100, 101, 102])]);
    const r = await fetchTechIndicators(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina on primary failure", async () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const sinaBody = closes.map((c, i) => ({ day: `2026-05-${i + 1}`, open: c, close: c, high: c, low: c }));
    const http = makeClient([fail(), { ok: true, status: 200, body: sinaBody }]);
    const r = await fetchTechIndicators(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.ma5).toBeCloseTo(127, 0);
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchTechIndicators(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});