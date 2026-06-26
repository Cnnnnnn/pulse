/**
 * tests/stocks/detail-fetchers/capital-flow.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCapitalFlow } from "../../../src/stocks/detail-fetchers/capital-flow.js";

const emOK = (klines) => ({ ok: true, status: 200, body: { data: { klines } } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

const kline = (date, main) => `${date},${main},0,0,0,0,0`;

beforeEach(() => vi.restoreAllMocks());

describe("fetchCapitalFlow", () => {
  it("sums 5d/10d main net inflow", async () => {
    // 15 天数据, main = [1..15] * 1e6. last5 = sum([11..15]) = 65e6. last10 = sum([6..15]) = 105e6.
    const klines = Array.from({ length: 15 }, (_, i) => kline(`2026-06-${(i + 1).toString().padStart(2, "0")}`, (i + 1) * 1e6));
    const http = makeClient([emOK(klines)]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.mainNetInflow5d).toBe(65e6);
    expect(r.data.mainNetInflow10d).toBe(105e6);
  });

  it("parse_failed when klines missing", async () => {
    const http = makeClient([{ ok: true, status: 200, body: { data: {} } }]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("fetch_failed when both fail (fallback not implemented)", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchCapitalFlow(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});