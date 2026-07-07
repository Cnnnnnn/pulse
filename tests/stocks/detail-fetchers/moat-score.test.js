/**
 * tests/stocks/detail-fetchers/moat-score.test.js
 *
 * moat-score fetcher 测 3 维评分 (marginEdge / roicEdge / revenueStability) 的 tier.
 * httpClient.get 只服务于 MAINFINADATA 财务接口; fetchIndustryPeers 单独 mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock fetchIndustryPeers (moat-score 用 require("./_shared-industry") 拿它).
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

const { fetchMoatScore } = await import("../../../src/stocks/detail-fetchers/moat-score.js");

// MAINFINADATA 财务 200 + data
function financeResponse(rows) {
  return { status: 200, body: { success: true, result: { data: rows } } };
}
const fail = (status = 500) => ({ status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

// 行业成员 helper: peers 数组, 本股 code, 行业名, 行业 ROE 中位/毛利率中位由 peers 算
function industryOk(peers, industry = "汽车零部件") {
  return { ok: true, data: { industry, boardCode: "BK1277", peers } };
}

// 构造行业 peers: n 只, 给定 ROE/毛利率; 本股 code 占 index 0.
// industryRoeMedian / industryGrossMedian 由这些 peers 的中位决定.
function buildPeers(thisRoe, thisGross, n = 10) {
  const peers = [];
  // 本股放第一只
  peers.push({ code: "600519", name: "本股", roe: thisRoe, grossMargin: thisGross, revenue: 1e10, netprofit: 1e9 });
  // 其余 n-1 只, ROE=8.5 毛利率=22 (让中位稳定)
  for (let i = 1; i < n; i++) {
    peers.push({ code: `p${i}`, name: `p${i}`, roe: 8.5, grossMargin: 22.0, revenue: 5e9, netprofit: 5e8 });
  }
  return peers;
}

beforeEach(() => {
  vi.restoreAllMocks();
  _mockIndustry.mockReset();
});

describe("fetchMoatScore", () => {
  it("3 维都满分 (毛利超行业中位 25pp, ROIC 超 15pp, 营收前 10% + CAGR 15%) → score=9", async () => {
    // 自身 5 年财务: 毛利率 47%, ROIC 23.5%, 净利增长稳定
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 23.5, XSMLL: 47.0, PARENTNETPROFIT: 1e9, TOTALOPERATEREVE: 1.2e10 },
      { REPORT_DATE: "2024-12-31", ROIC: 22.0, XSMLL: 45.0, PARENTNETPROFIT: 0.9e9, TOTALOPERATEREVE: 1.1e10 },
      { REPORT_DATE: "2023-12-31", ROIC: 21.0, XSMLL: 44.0, PARENTNETPROFIT: 0.8e9, TOTALOPERATEREVE: 1.0e10 },
    ];
    // peers: 本股 revenue 最大 → rank 1, total 10 → topFrac 0.1 ≤ 0.3 稳定
    const peers = buildPeers(30.0, 47.0, 10);
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.score).toBe(9);
    expect(r.data.breakdown).toEqual({ marginEdge: 3, roicEdge: 3, revenueStability: 3 });
    // 行业中位: ROE 中位 = 8.5 (10 只, 本股 30, 其余 8.5 → 中位 8.5)
    expect(r.data.metrics.industryRoicMedian).toBeCloseTo(8.5);
    expect(r.data.metrics.industryGrossMarginMedian).toBeCloseTo(22.0);
    expect(r.data.metrics.revenueRankInIndustry).toBe(1);
    expect(r.data.metrics.industryTotal).toBe(10);
  });

  it("3 维都 0 (毛利低于行业中位, ROIC 负, 营收靠后) → score=0, note 标无护城河", async () => {
    // 净利持平 (CAGR=0), 本股营收靠后 rank 10/10 不稳定
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: -2.0, XSMLL: 8.0, PARENTNETPROFIT: 3e6, TOTALOPERATEREVE: 1e6 },
      { REPORT_DATE: "2024-12-31", ROIC: -1.0, XSMLL: 9.0, PARENTNETPROFIT: 3e6, TOTALOPERATEREVE: 2e6 },
      { REPORT_DATE: "2023-12-31", ROIC: 1.0, XSMLL: 10.0, PARENTNETPROFIT: 3e6, TOTALOPERATEREVE: 3e6 },
    ];
    // 本股 revenue 最小 → rank 10/10, topFrac 1.0 > 0.3 不稳定
    const peers = [];
    for (let i = 1; i < 10; i++) {
      peers.push({ code: `p${i}`, name: `p${i}`, roe: 8.5, grossMargin: 22.0, revenue: 5e9, netprofit: 5e8 });
    }
    peers.push({ code: "600519", name: "本股", roe: -2.0, grossMargin: 8.0, revenue: 1e6, netprofit: 1e6 });
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.score).toBe(0);
    expect(r.data.note).toMatch(/无护城河/);
  });

  it("毛利率缺失 (单点) → marginEdge=0, note 标数据缺失", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 23.5, PARENTNETPROFIT: 1e9, TOTALOPERATEREVE: 1e10 /* XSMLL 缺失 */ },
    ];
    const peers = buildPeers(30.0, null, 10);
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.breakdown.marginEdge).toBe(0);
    expect(r.data.note).toMatch(/数据缺失/);
  });

  it("毛利超行业中位 25pp (47-22) → marginEdge=3 (假设 70 分位条件满足)", async () => {
    // 自身毛利率序列 [47, 45, 44], 当前 47 ≥ p70
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 5.0, XSMLL: 47.0, PARENTNETPROFIT: 1e8, TOTALOPERATEREVE: 1e10 },
      { REPORT_DATE: "2024-12-31", ROIC: 4.0, XSMLL: 45.0, PARENTNETPROFIT: 0.9e8, TOTALOPERATEREVE: 9e9 },
      { REPORT_DATE: "2023-12-31", ROIC: 3.0, XSMLL: 44.0, PARENTNETPROFIT: 0.8e8, TOTALOPERATEREVE: 8e9 },
    ];
    const peers = buildPeers(5.0, 47.0, 10);
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.breakdown.marginEdge).toBe(3);
  });

  it("毛利超行业中位 12pp (34-22) → marginEdge=2", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 5.0, XSMLL: 34.0, PARENTNETPROFIT: 1e8, TOTALOPERATEREVE: 1e10 },
      { REPORT_DATE: "2024-12-31", ROIC: 4.0, XSMLL: 32.0, PARENTNETPROFIT: 0.9e8, TOTALOPERATEREVE: 9e9 },
      { REPORT_DATE: "2023-12-31", ROIC: 3.0, XSMLL: 30.0, PARENTNETPROFIT: 0.8e8, TOTALOPERATEREVE: 8e9 },
    ];
    const peers = buildPeers(5.0, 34.0, 10);
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.breakdown.marginEdge).toBe(2);
  });

  it("ROIC 超行业中位 12pp (20.5-8.5) → roicEdge=3", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 20.5, XSMLL: 22.0, PARENTNETPROFIT: 1e8, TOTALOPERATEREVE: 1e10 },
      { REPORT_DATE: "2024-12-31", ROIC: 19.0, XSMLL: 21.0, PARENTNETPROFIT: 0.9e8, TOTALOPERATEREVE: 9e9 },
      { REPORT_DATE: "2023-12-31", ROIC: 18.0, XSMLL: 20.0, PARENTNETPROFIT: 0.8e8, TOTALOPERATEREVE: 8e9 },
    ];
    const peers = buildPeers(20.5, 22.0, 10);
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.breakdown.roicEdge).toBe(3);
  });

  it("营收前 10% + CAGR 15% → revenueStability=3", async () => {
    // CAGR: 1.5e9 / 1.1e9 ^ (1/2) - 1 ≈ 16.7%
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.5e9, TOTALOPERATEREVE: 1.5e10 },
      { REPORT_DATE: "2024-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.3e9, TOTALOPERATEREVE: 1.4e10 },
      { REPORT_DATE: "2023-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.1e9, TOTALOPERATEREVE: 1.3e10 },
    ];
    // 本股 revenue 最大 → rank 1/10
    const peers = buildPeers(5.0, 22.0, 10);
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.breakdown.revenueStability).toBe(3);
  });

  it("营收靠后 (rank 8/10) + CAGR 3% → revenueStability=0", async () => {
    // CAGR: 1.1e9 / 1.0e9 ^ (1/2) - 1 ≈ 4.88% < 5%
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.1e9, TOTALOPERATEREVE: 3e9 },
      { REPORT_DATE: "2024-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.05e9, TOTALOPERATEREVE: 2.9e9 },
      { REPORT_DATE: "2023-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.0e9, TOTALOPERATEREVE: 2.8e9 },
    ];
    // 本股 revenue=3e9, 其余 9 只都 5e9 → 本股排最后 rank 10/10
    const peers = [];
    for (let i = 1; i < 10; i++) {
      peers.push({ code: `p${i}`, name: `p${i}`, roe: 8.5, grossMargin: 22.0, revenue: 5e9, netprofit: 5e8 });
    }
    peers.push({ code: "600519", name: "本股", roe: 5.0, grossMargin: 22.0, revenue: 3e9, netprofit: 1.1e9 });
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.metrics.revenueRankInIndustry).toBe(10);
    expect(r.data.breakdown.revenueStability).toBe(0);
  });

  it("MAINFINADATA 500 → reason: fetch_failed", async () => {
    _mockIndustry.mockResolvedValue(industryOk(buildPeers(30, 47, 10)));
    const http = makeClient([fail(500)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  it("fetchIndustryPeers 失败 → 透传 reason", async () => {
    _mockIndustry.mockResolvedValue({ ok: false, reason: "no_industry_data", error: "board 空" });
    const http = makeClient([financeResponse([{ ROIC: 5, XSMLL: 22, PARENTNETPROFIT: 1e8, TOTALOPERATEREVE: 1e10 }])]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
  });

  it("finance 接口 200 但 body 非 JSON → reason: parse_failed", async () => {
    _mockIndustry.mockResolvedValue(industryOk(buildPeers(30, 47, 10)));
    const http = makeClient([{ status: 200, body: "not valid json {{{" }]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("finance 接口 result.data 为空 → reason: no_finance_data", async () => {
    _mockIndustry.mockResolvedValue(industryOk(buildPeers(30, 47, 10)));
    const http = makeClient([financeResponse([])]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_finance_data");
  });

  it("tier 1 门是 ROIC: 毛利超行业中位但 ROIC ≤ 行业中位 → marginEdge=0 (不命中 tier 1)", async () => {
    // 毛利 23 > 行业中位 22 (diff > 0), 但 ROIC 5 ≤ 行业 ROE 中位 8.5 → tier 1 门不满足
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 5.0, XSMLL: 23.0, PARENTNETPROFIT: 1e8, TOTALOPERATEREVE: 1e10 },
      { REPORT_DATE: "2024-12-31", ROIC: 4.5, XSMLL: 22.0, PARENTNETPROFIT: 0.9e8, TOTALOPERATEREVE: 9e9 },
      { REPORT_DATE: "2023-12-31", ROIC: 4.0, XSMLL: 21.0, PARENTNETPROFIT: 0.8e8, TOTALOPERATEREVE: 8e9 },
    ];
    const peers = buildPeers(5.0, 23.0, 10);
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.breakdown.marginEdge).toBe(0);
  });

  it("tier 2/3 门是自身 70 分位: 毛利高但近 3 年下滑, 当前 < 70 分位 → marginEdge 不命中 tier 2/3", async () => {
    // XSMLL 序列 = [25, 45, 50] (按时间倒序), sorted=[25,45,50], idx=0.7*2=1.4
    // p70 = 45 + 0.4*(50-45) = 47, 当前 25 < 47 → tier 2/3 门不满足
    // 但 ROIC 25 > 行业中位 8.5 → tier 1 门满足, diff=25-22=3 不>10/20 → marginEdge=1
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 25.0, XSMLL: 25.0, PARENTNETPROFIT: 1e9, TOTALOPERATEREVE: 1e10 },
      { REPORT_DATE: "2024-12-31", ROIC: 22.0, XSMLL: 45.0, PARENTNETPROFIT: 0.9e9, TOTALOPERATEREVE: 9e9 },
      { REPORT_DATE: "2023-12-31", ROIC: 21.0, XSMLL: 50.0, PARENTNETPROFIT: 0.8e9, TOTALOPERATEREVE: 8e9 },
    ];
    const peers = buildPeers(25.0, 25.0, 10);
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.breakdown.marginEdge).toBe(1);
  });

  it("营收排名在 peers 找不到本股 → revenueRank null, revenueStability 退化只看 cagr", async () => {
    // peers 里本股 code 不匹配 (模拟本股不在 LICO 行业成员列表的边缘 case)
    const financeRows = [
      { REPORT_DATE: "2025-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.5e9, TOTALOPERATEREVE: 1e10 },
      { REPORT_DATE: "2024-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.3e9, TOTALOPERATEREVE: 9e9 },
      { REPORT_DATE: "2023-12-31", ROIC: 5.0, XSMLL: 22.0, PARENTNETPROFIT: 1.1e9, TOTALOPERATEREVE: 8e9 },
    ];
    // peers 里没有 code=600519
    const peers = [{ code: "999999", name: "x", roe: 8.5, grossMargin: 22.0, revenue: 5e9, netprofit: 5e8 }];
    _mockIndustry.mockResolvedValue(industryOk(peers));
    const http = makeClient([financeResponse(financeRows)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.metrics.revenueRankInIndustry).toBeNull();
    // cagr ≈ 16.7% > 10 → revenueStability=2 (退化路径)
    expect(r.data.breakdown.revenueStability).toBe(2);
    expect(r.data.note).toMatch(/数据缺失/); // 营收稳定度维度缺失
  });
});
