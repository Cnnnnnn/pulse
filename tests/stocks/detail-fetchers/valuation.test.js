/**
 * tests/stocks/detail-fetchers/valuation.test.js
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchValuation } from "../../../src/stocks/detail-fetchers/valuation.js";

const push2OK = (data) => ({ ok: true, status: 200, body: { data } });
const dcOK = (data) => ({ ok: true, status: 200, body: { result: { data } } });
const fail = () => ({ ok: false, status: 500, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => vi.restoreAllMocks());

describe("fetchValuation", () => {
  it("computes PE/PB from push2 price + datacenter EPS/BPS", async () => {
    // f43 单位 厘; 价格 147.28 元 → 14728
    // 茅台价格 1685 元 → 168500
    const http = makeClient([
      push2OK({ f43: 168500 }), // push2 实时价
      dcOK([{ SECUCODE: "600519.SH", EPSXS: 31.4, BPS: 312 }]), // datacenter 财务
    ]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBeCloseTo(1685 / 31.4, 1);
    expect(r.data.pb).toBeCloseTo(1685 / 312, 1);
  });

  it("ok with pe=null when datacenter has no EPS", async () => {
    const http = makeClient([
      push2OK({ f43: 168500 }),
      dcOK([{ SECUCODE: "600519.SH", EPSXS: null, BPS: 312 }]),
    ]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pe).toBeNull();
    expect(r.data.pb).toBeCloseTo(1685 / 312, 1);
  });

  it("fetch_failed when both sources fail", async () => {
    const http = makeClient([fail(), fail()]);
    const r = await fetchValuation(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });
});
