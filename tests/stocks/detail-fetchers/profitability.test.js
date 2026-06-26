/**
 * tests/stocks/detail-fetchers/profitability.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchProfitability } from "../../../src/stocks/detail-fetchers/profitability.js";

const emOK = (data) => ({ ok: true, status: 200, body: { data } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchProfitability", () => {
  it("parses ROE/gross/net margin from F10", async () => {
    const http = makeClient([emOK({ f37: "22.5", f22: "90.1", f24: "55.2", reportDate: "2025-12-31" })]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.roe).toBeCloseTo(22.5, 1);
    expect(r.data.grossMargin).toBeCloseTo(90.1, 1);
    expect(r.data.netMargin).toBeCloseTo(55.2, 1);
    expect(r.data.reportDate).toBe("2025-12-31");
  });

  it("parse_failed when roe missing", async () => {
    const http = makeClient([emOK({})]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("falls back to sina on primary failure", async () => {
    const http = makeClient([fail(), { ok: true, status: 200, body: "<html>ROE=22.5;GP=90.1;NM=55.2</html>" }]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.roe).toBeCloseTo(22.5, 1);
  });

  it("fetch_failed when both fail", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});