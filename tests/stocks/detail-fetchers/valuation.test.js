/**
 * tests/stocks/detail-fetchers/valuation.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchValuation } from "../../../src/stocks/detail-fetchers/valuation.js";

const emOK = (data) => ({ ok: true, status: 200, body: { data } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchValuation", () => {
  it("computes PE/PB from eastmoney F10", async () => {
    const http = makeClient([emOK({ f57: 30, f59: 50, f60: 1e8, f116: 1.5e11 })]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBeCloseTo(50, 0);
    expect(r.data.pb).toBeCloseTo(30, 0);
    expect(r.data.pePercentile3y).toBeNull();
  });

  it("parse_failed when essential fields missing", async () => {
    const http = makeClient([emOK({})]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to tencent on eastmoney failure", async () => {
    // ponytail: plan's parseTencent gates on parts.length < 50; real tencent rows have 50+ fields.
    // Original plan fixture had 48 fields — padded to 50 so the gate matches reality.
    const tencentBody = `v_sh600519="1,贵州茅台,600519,2000,1950,200,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,28.5,2026-06-25,1500,1500,30,50,1500,1500,1500,1500,1500"`;
    const http = makeClient([fail(), { ok: true, status: 200, body: tencentBody }]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
