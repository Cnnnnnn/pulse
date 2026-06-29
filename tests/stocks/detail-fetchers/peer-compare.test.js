/**
 * tests/stocks/detail-fetchers/peer-compare.test.js
 *
 * peer-compare fetcher 测 datacenter 行业均值接口 + valuation 复用 + 偏差百分比算.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock valuation fetcher. peer-compare.js 用 require("./valuation") 拉它, 而
// vitest 的 vi.mock 不拦截 CJS require, 所以走 vi.hoisted 提前把 mock 塞进
// require.cache, 让 peer-compare 的 require 命中我们注入的假模块.
const _mockValuation = vi.fn();
vi.hoisted(() => {
  const path = require("path");
  // 解析到 peer-compare 视角的相对路径 (跟它 require 用的完全一样)
  const modulePath = path.resolve(
    __dirname,
    "../../../src/stocks/detail-fetchers/valuation.js",
  );
  // 清掉之前可能加载的真实模块, 再塞进 mock
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: {
      fetchValuation: (...args) => _mockValuation(...args),
    },
  };
});

const { fetchPeerCompare } = await import("../../../src/stocks/detail-fetchers/peer-compare.js");

// datacenter 200 + 完整数据
function datacenterResponse(rows) {
  return { ok: true, status: 200, body: { success: true, result: { data: rows } } };
}
// datacenter 200 但 data 为空
function datacenterEmpty() {
  return { ok: true, status: 200, body: { success: true, result: { data: [] } } };
}
const fail = (status = 500) => ({ ok: false, status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

beforeEach(() => {
  _mockValuation.mockReset();
});

describe("fetchPeerCompare", () => {
  it("正常路径: valuation + datacenter 都成功 → 返完整 data, 偏差百分比算对", async () => {
    _mockValuation.mockResolvedValue({
      ok: true,
      data: { pe: 28.5, pb: 4.2 },
    });
    // datacenter 返: 行业 52 只, PE 中位 22.0, 这只 PE rank 18 / PB 中位 3.1, PB rank 21
    const http = makeClient([
      datacenterResponse([
        { SECURITY_CODE: "600519", INDUSTRY_NAME: "汽车零部件", PE_TTM: 28.5, PE_TTM_MEDIAN: 22.0, PE_TTM_RANK: 18, TOTAL: 52,
          PB_MQR: 4.2, PB_MQR_MEDIAN: 3.1, PB_MQR_RANK: 21 },
      ]),
    ]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.industry).toBe("汽车零部件");
    expect(r.data.pe).toBe(28.5);
    expect(r.data.peIndustryMedian).toBe(22.0);
    expect(r.data.peRank).toBe(18);
    expect(r.data.peTotal).toBe(52);
    // (28.5 - 22.0) / 22.0 * 100 = 29.5454... 用 closeTo
    expect(r.data.peDeviationPct).toBeCloseTo(29.55, 1);
    expect(r.data.pb).toBe(4.2);
    expect(r.data.pbIndustryMedian).toBe(3.1);
    expect(r.data.pbRank).toBe(21);
    expect(r.data.pbDeviationPct).toBeCloseTo(35.48, 1); // (4.2-3.1)/3.1*100
  });

  it("valuation 失败 (无 industry) → reason: no_industry_data, 不打 datacenter", async () => {
    _mockValuation.mockResolvedValue({
      ok: false,
      reason: "fetch_failed",
      error: "no industry",
    });
    const http = makeClient([]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
    expect(http.get).not.toHaveBeenCalled(); // valuation 失败直接短路
  });

  it("datacenter 500 → reason: fetch_failed", async () => {
    _mockValuation.mockResolvedValue({
      ok: true,
      data: { pe: 28.5, pb: 4.2 },
    });
    const http = makeClient([fail(500)]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  it("datacenter 200 但 data=[] → reason: no_industry_data", async () => {
    _mockValuation.mockResolvedValue({
      ok: true,
      data: { pe: 28.5, pb: 4.2 },
    });
    const http = makeClient([datacenterEmpty()]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
  });

  it("deviation pct 边界: 这只 PE == 行业中位 → 0", async () => {
    _mockValuation.mockResolvedValue({
      ok: true,
      data: { pe: 22.0, pb: 3.1 },
    });
    const http = makeClient([
      datacenterResponse([
        { SECURITY_CODE: "000001", INDUSTRY_NAME: "汽车零部件", PE_TTM: 22.0, PE_TTM_MEDIAN: 22.0, PE_TTM_RANK: 26, TOTAL: 52,
          PB_MQR: 3.1, PB_MQR_MEDIAN: 3.1, PB_MQR_RANK: 26 },
      ]),
    ]);
    const r = await fetchPeerCompare(http, { code: "000001" });
    expect(r.ok).toBe(true);
    expect(r.data.peDeviationPct).toBe(0);
    expect(r.data.pbDeviationPct).toBe(0);
  });

  it("datacenter row 缺 INDUSTRY_NAME → reason: no_industry_data", async () => {
    _mockValuation.mockResolvedValue({
      ok: true,
      data: { pe: 28.5, pb: 4.2 },
    });
    // datacenter 返了一行但没有 INDUSTRY_NAME 字段
    const http = makeClient([
      datacenterResponse([
        { SECURITY_CODE: "688xxx", PE_TTM: 28.5, PE_TTM_MEDIAN: 22.0, PE_TTM_RANK: 18, TOTAL: 52,
          PB_MQR: 4.2, PB_MQR_MEDIAN: 3.1, PB_MQR_RANK: 21 },
      ]),
    ]);
    const r = await fetchPeerCompare(http, { code: "688xxx" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
  });
});
