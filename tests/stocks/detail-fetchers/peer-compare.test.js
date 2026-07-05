/**
 * tests/stocks/detail-fetchers/peer-compare.test.js
 *
 * peer-compare fetcher 测: valuation 复用 + VALUATIONSTATUS 历史分位 + 行业 ROE/毛利率中位.
 * httpClient.get 顺序: VALUATIONSTATUS → board(LICO 步骤1) → member(LICO 步骤2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock valuation fetcher (同原测试: vi.hoisted 注入 require.cache).
const _mockValuation = vi.fn();
vi.hoisted(() => {
  const path = require("path");
  const modulePath = path.resolve(
    __dirname,
    "../../../src/stocks/detail-fetchers/valuation.js",
  );
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

// mock fetchIndustryPeers (peer-compare 用 require("./_shared-industry") 拿它).
// 这样测试只验 peer-compare 的编排 + 字段映射, 不耦合 LICO 两步细节 (_shared-industry 有自己测试).
const _mockIndustry = vi.fn();
vi.hoisted(() => {
  const path = require("path");
  const modulePath = path.resolve(
    __dirname,
    "../../../src/stocks/detail-fetchers/_shared-industry.js",
  );
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: {
      fetchIndustryPeers: (...args) => _mockIndustry(...args),
    },
  };
});

const { fetchPeerCompare } = await import("../../../src/stocks/detail-fetchers/peer-compare.js");

// VALUATIONSTATUS datacenter 200 (type=1 PE, type=2 PB)
function valuationStatusResponse(rows) {
  return { status: 200, body: { success: true, result: { data: rows } } };
}
const fail = (status = 500) => ({ status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

// 行业成员 (3 只), 客户端算中位
function industryOk(peers) {
  return { ok: true, data: { industry: "白酒", boardCode: "BK1277", peers } };
}
const PEERS = [
  { code: "600519", name: "贵州茅台", roe: 30.1, grossMargin: 91.2, revenue: 1.5e11, netprofit: 8.6e10 },
  { code: "000858", name: "五粮液", roe: 22.5, grossMargin: 75.0, revenue: 8.3e10, netprofit: 3.0e10 },
  { code: "002304", name: "洋河股份", roe: 18.0, grossMargin: 60.0, revenue: 3.3e10, netprofit: 9.3e9 },
];
// ROE 中位 = 22.5, 毛利率中位 = 75.0

beforeEach(() => {
  _mockValuation.mockReset();
  _mockIndustry.mockReset();
});

describe("fetchPeerCompare", () => {
  it("正常路径: valuation + VALUATIONSTATUS + industry 都成功 → 返完整 data", async () => {
    _mockValuation.mockResolvedValue({ ok: true, data: { pe: 28.5, pb: 4.2 } });
    _mockIndustry.mockResolvedValue(industryOk(PEERS));
    const http = makeClient([
      valuationStatusResponse([
        { INDICATOR_TYPE: 1, INDEX_VALUE: 28.5, INDEX_PERCENTILE: 78.5, VALATION_STATUS: "偏高" },
        { INDICATOR_TYPE: 2, INDEX_VALUE: 4.2, INDEX_PERCENTILE: 55.0, VALATION_STATUS: "合理" },
      ]),
    ]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.industry).toBe("白酒");
    expect(r.data.pe).toBe(28.5);
    expect(r.data.pePercentile).toBeCloseTo(78.5);
    expect(r.data.peValuationStatus).toBe("偏高");
    expect(r.data.pb).toBe(4.2);
    expect(r.data.pbPercentile).toBeCloseTo(55.0);
    expect(r.data.pbValuationStatus).toBe("合理");
    // ROE 中位 = 22.5 (3 个值排序 [18, 22.5, 30.1] 取中间)
    expect(r.data.roeIndustryMedian).toBeCloseTo(22.5);
    // 毛利率中位 = 75.0 ([60, 75, 91.2])
    expect(r.data.grossMarginIndustryMedian).toBeCloseTo(75.0);
  });

  it("valuation 失败 → reason: no_industry_data, 不打 http", async () => {
    _mockValuation.mockResolvedValue({ ok: false, reason: "fetch_failed", error: "no industry" });
    const http = makeClient([]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
    expect(http.get).not.toHaveBeenCalled();
  });

  it("fetchIndustryPeers 失败 → 透传 reason", async () => {
    _mockValuation.mockResolvedValue({ ok: true, data: { pe: 28.5, pb: 4.2 } });
    _mockIndustry.mockResolvedValue({ ok: false, reason: "no_industry_data", error: "board 空" });
    const http = makeClient([
      valuationStatusResponse([{ INDICATOR_TYPE: 1, INDEX_PERCENTILE: 70 }]),
    ]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
  });

  it("VALUATIONSTATUS 500 → pePercentile/pbPercentile 为 null (仍返 ok)", async () => {
    _mockValuation.mockResolvedValue({ ok: true, data: { pe: 28.5, pb: 4.2 } });
    _mockIndustry.mockResolvedValue(industryOk(PEERS));
    const http = makeClient([fail(500)]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pePercentile).toBeNull();
    expect(r.data.pbPercentile).toBeNull();
    expect(r.data.peValuationStatus).toBeNull();
    // 行业中位仍正常
    expect(r.data.roeIndustryMedian).toBeCloseTo(22.5);
  });

  it("VALUATIONSTATUS 只返 PE (无 PB) → pbPercentile 为 null, pe 正常", async () => {
    _mockValuation.mockResolvedValue({ ok: true, data: { pe: 28.5, pb: 4.2 } });
    _mockIndustry.mockResolvedValue(industryOk(PEERS));
    const http = makeClient([
      valuationStatusResponse([{ INDICATOR_TYPE: 1, INDEX_PERCENTILE: 65.0, VALATION_STATUS: "合理" }]),
    ]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.pePercentile).toBeCloseTo(65.0);
    expect(r.data.pbPercentile).toBeNull();
  });

  it("ROE 中位: 偶数个 peers 取中间两数平均", async () => {
    _mockValuation.mockResolvedValue({ ok: true, data: { pe: 28.5, pb: 4.2 } });
    // 4 只, ROE = [10, 20, 30, 40] → 中位 (20+30)/2 = 25
    const peers4 = [
      { code: "a", name: "A", roe: 10, grossMargin: null, revenue: null, netprofit: null },
      { code: "b", name: "B", roe: 20, grossMargin: null, revenue: null, netprofit: null },
      { code: "c", name: "C", roe: 30, grossMargin: null, revenue: null, netprofit: null },
      { code: "d", name: "D", roe: 40, grossMargin: null, revenue: null, netprofit: null },
    ];
    _mockIndustry.mockResolvedValue(industryOk(peers4));
    const http = makeClient([valuationStatusResponse([])]);
    const r = await fetchPeerCompare(http, { code: "600519" });
    expect(r.data.roeIndustryMedian).toBeCloseTo(25);
    // 毛利率全 null → null
    expect(r.data.grossMarginIndustryMedian).toBeNull();
  });
});
