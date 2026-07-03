/**
 * tests/stocks/detail-fetchers/moat-score.test.js
 *
 * moat-score fetcher 测 3 维评分 (marginEdge / roicEdge / revenueStability) 的 4 个 tier.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchMoatScore } = await import("../../../src/stocks/detail-fetchers/moat-score.js");

// datacenter 自身财务: 5 年 ROIC + 毛利率 + 净利
function financeResponse(rows) {
  return { status: 200, body: { success: true, result: { data: rows } } };
}
// datacenter 行业均值
function industryResponse(rows) {
  return { status: 200, body: { success: true, result: { data: rows } } };
}
const fail = (status = 500) => ({ status, error: "http_error" });

function makeClient(responses) {
  return { get: vi.fn(async () => responses.shift() || fail()) };
}

// 默认 industry = "汽车零部件", 行业总股票 52
const DEFAULT_INDUSTRY = { INDUSTRY_NAME: "汽车零部件", TOTAL: 52, ROIC_MEDIAN: 8.5, XSMLL_MEDIAN: 22.0 };

beforeEach(() => vi.restoreAllMocks());

describe("fetchMoatScore", () => {
  it("3 维都满分 (毛利超行业中位 25pp, ROIC 超 15pp, 排名稳定 + CAGR 15%) → score=9", async () => {
    // 自身 5 年财务: 毛利率 47%, ROIC 23.5%, 净利增长稳定, 排名稳定在 5
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 23.5, XSMLL: 47.0, NETPROFIT: 1e9, XSMLL_RANK: 5 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: 22.0, XSMLL: 45.0, NETPROFIT: 0.9e9, XSMLL_RANK: 5 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 21.0, XSMLL: 44.0, NETPROFIT: 0.8e9, XSMLL_RANK: 6 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.score).toBe(9);
    expect(r.data.breakdown).toEqual({ marginEdge: 3, roicEdge: 3, revenueStability: 3 });
    expect(r.data.metrics.industryRoicMedian).toBe(8.5);
    expect(r.data.metrics.industryGrossMarginMedian).toBe(22.0);
  });

  it("3 维都 0 (毛利低于行业中位, ROIC 负, 排名下降) → score=0, note 标无护城河", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: -2.0, XSMLL: 8.0, NETPROFIT: -1e8, XSMLL_RANK: 45 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: -1.0, XSMLL: 9.0, NETPROFIT: -0.5e8, XSMLL_RANK: 30 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 1.0, XSMLL: 10.0, NETPROFIT: 0, XSMLL_RANK: 20 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.score).toBe(0);
    expect(r.data.note).toMatch(/无护城河/);
  });

  it("毛利率缺失 (单点) → marginEdge=0, 总分 = 剩余 2 维, note 标数据缺失", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 23.5, NETPROFIT: 1e9, XSMLL_RANK: 5 /* 毛利率缺失 */ },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.breakdown.marginEdge).toBe(0);
    expect(r.data.note).toMatch(/数据缺失/);
  });

  it("毛利超行业中位 25pp (47-22) → marginEdge=3 (假设 70 分位条件满足)", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 5.0, XSMLL: 47.0, NETPROFIT: 1e8, XSMLL_RANK: 5 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: 4.0, XSMLL: 45.0, NETPROFIT: 0.9e8, XSMLL_RANK: 5 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 3.0, XSMLL: 44.0, NETPROFIT: 0.8e8, XSMLL_RANK: 6 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.breakdown.marginEdge).toBe(3);
  });

  it("毛利超行业中位 12pp (34-22) → marginEdge=2", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 5.0, XSMLL: 34.0, NETPROFIT: 1e8, XSMLL_RANK: 5 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: 4.0, XSMLL: 32.0, NETPROFIT: 0.9e8, XSMLL_RANK: 5 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 3.0, XSMLL: 30.0, NETPROFIT: 0.8e8, XSMLL_RANK: 6 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.breakdown.marginEdge).toBe(2);
  });

  it("ROIC 超行业中位 12pp (20.5-8.5) → roicEdge=3", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 20.5, XSMLL: 22.0, NETPROFIT: 1e8, XSMLL_RANK: 20 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: 19.0, XSMLL: 21.0, NETPROFIT: 0.9e8, XSMLL_RANK: 20 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 18.0, XSMLL: 20.0, NETPROFIT: 0.8e8, XSMLL_RANK: 21 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.breakdown.roicEdge).toBe(3);
  });

  it("营收 CAGR 15% 排名稳定 (5 → 5 → 6, 极差 1) → revenueStability=3", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 5.0, XSMLL: 22.0, NETPROFIT: 1.5e9, XSMLL_RANK: 5 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: 5.0, XSMLL: 22.0, NETPROFIT: 1.3e9, XSMLL_RANK: 5 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 5.0, XSMLL: 22.0, NETPROFIT: 1.1e9, XSMLL_RANK: 6 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.breakdown.revenueStability).toBe(3);
  });

  it("营收 CAGR 3% (低于 5%) 排名波动大 → revenueStability=0", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 5.0, XSMLL: 22.0, NETPROFIT: 1.1e9, XSMLL_RANK: 15 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: 5.0, XSMLL: 22.0, NETPROFIT: 1.05e9, XSMLL_RANK: 5 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 5.0, XSMLL: 22.0, NETPROFIT: 1.0e9, XSMLL_RANK: 25 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.data.breakdown.revenueStability).toBe(0);
  });

  it("datacenter 500 → reason: fetch_failed", async () => {
    const http = makeClient([fail(500)]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("fetch_failed");
  });

  it("datacenter industry 接口 200 但 row 缺 INDUSTRY_NAME → reason: no_industry_data", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 23.5, XSMLL: 47.0, NETPROFIT: 1e9, XSMLL_RANK: 5 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      // industry 接口 200 但缺 INDUSTRY_NAME 字段
      industryResponse([{ TOTAL: 52, ROIC_MEDIAN: 8.5, XSMLL_MEDIAN: 22.0 }]),
    ]);
    const r = await fetchMoatScore(http, { code: "688xxx" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_industry_data");
  });

  it("finance 接口 200 但 body 非 JSON → reason: parse_failed", async () => {
    const http = makeClient([
      { status: 200, body: "not valid json {{{" },
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("industry 接口 200 但 body 非 JSON → reason: parse_failed", async () => {
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 23.5, XSMLL: 47.0, NETPROFIT: 1e9, XSMLL_RANK: 5 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      { status: 200, body: "<html>oops</html>" },
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_failed");
  });

  it("tier 1 门是 ROIC: 毛利超行业中位但 ROIC ≤ 行业中位 → marginEdge=0 (不命中 tier 1)", async () => {
    // 毛利 23 > 行业中位 22 (diff > 0), 但 ROIC 5 ≤ 行业中位 8.5 → tier 1 门 (ROIC > 行业中位) 不满足
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 5.0, XSMLL: 23.0, NETPROFIT: 1e8, XSMLL_RANK: 5 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: 4.5, XSMLL: 22.0, NETPROFIT: 0.9e8, XSMLL_RANK: 5 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 4.0, XSMLL: 21.0, NETPROFIT: 0.8e8, XSMLL_RANK: 6 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    expect(r.data.breakdown.marginEdge).toBe(0);
  });

  it("tier 2/3 门是自身 70 分位: 毛利高但近 3 年下滑, 当前 < 70 分位 → marginEdge 不命中 tier 2/3", async () => {
    // XSMLL 序列 = [50, 45, 25] (按时间倒序), 实际历史 = [50, 45, 25] (这里测试按 datacenter 返回顺序)
    // 线性插值: sorted=[25, 45, 50], idx=0.7*(3-1)=1.4, p70 = 45 + 0.4*(50-45) = 47
    // 当前 XSMLL=25 < 47 → tier 2/3 门不满足, 即使 diff>20 也不命中 tier 3
    const financeRows = [
      { REPORT_DATE: "2025-12-31", REPORT_YEAR: 2025, ROIC: 25.0, XSMLL: 25.0, NETPROFIT: 1e9, XSMLL_RANK: 5 },
      { REPORT_DATE: "2024-12-31", REPORT_YEAR: 2024, ROIC: 22.0, XSMLL: 45.0, NETPROFIT: 0.9e9, XSMLL_RANK: 5 },
      { REPORT_DATE: "2023-12-31", REPORT_YEAR: 2023, ROIC: 21.0, XSMLL: 50.0, NETPROFIT: 0.8e9, XSMLL_RANK: 6 },
    ];
    const http = makeClient([
      financeResponse(financeRows),
      industryResponse([{ ...DEFAULT_INDUSTRY }]),
    ]);
    const r = await fetchMoatScore(http, { code: "600519" });
    expect(r.ok).toBe(true);
    // tier 1 门: ROIC 25 > 行业中位 8.5 ✓ → 但 diff = 25-22 = 3, 不 > 10/20, 所以 marginEdge 还是命中 tier 1 = 1
    expect(r.data.breakdown.marginEdge).toBe(1);
  });
});