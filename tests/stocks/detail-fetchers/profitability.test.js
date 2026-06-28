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

const dcOK = (row) => ({
  ok: true,
  status: 200,
  body: { result: { data: [row] } },
});

describe("fetchProfitability", () => {
  it("parses ROE/gross/net margin from F10", async () => {
    const http = makeClient([
      emOK({ f37: "22.5", f22: "90.1", f24: "55.2", reportDate: "2025-12-31" }),
    ]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.roe).toBeCloseTo(22.5, 1);
    expect(r.data.grossMargin).toBeCloseTo(90.1, 1);
    expect(r.data.netMargin).toBeCloseTo(55.2, 1);
    expect(r.data.reportDate).toBe("2025-12-31");
  });

  it("falls back to datacenter MAINFINADATA when F10 has no ROE/GMargin/NMargin", async () => {
    // ponytail: em 2026 把 f37/f22/f24 从 F10 拆到 datacenter; F10 返空就该走这个.
    const http = makeClient([
      emOK({ f57: "600519", f58: "贵州茅台", f59: 2 }), // F10 没 ROE
      dcOK({
        SECUCODE: "600519.SH",
        REPORT_DATE: "2026-03-31",
        ROEJQ: 10.5,
        XSMLL: 89.7,
        XSJLL: 52.2,
      }),
    ]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.roe).toBeCloseTo(10.5, 1);
    expect(r.data.grossMargin).toBeCloseTo(89.7, 1);
    expect(r.data.netMargin).toBeCloseTo(52.2, 1);
    expect(r.data.reportDate).toBe("2026-03-31");
  });

  it("falls back to sina on primary network failure", async () => {
    const http = makeClient([
      fail(),
      fail(), // datacenter 失败
      { ok: true, status: 200, body: "<html>ROE=22.5;GP=90.1;NM=55.2</html>" },
    ]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.roe).toBeCloseTo(22.5, 1);
  });

  it("fetch_failed when all sources fail", async () => {
    const http = makeClient([fail(), fail(), fail()]);
    const r = await fetchProfitability(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
