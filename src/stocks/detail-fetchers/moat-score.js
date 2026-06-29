/**
 * src/stocks/detail-fetchers/moat-score.js
 *
 * moat_score angle fetcher. 客户端算 3 维护城河评分:
 *   - marginEdge (0-3): 毛利率相对行业中位的优势
 *   - roicEdge (0-3): ROIC 相对行业中位的优势
 *   - revenueStability (0-3): 营收 5 年 CAGR + 行业排名稳定性
 *
 * ponytail: 评分规则 hardcode 在这里 (不依赖 LLM 算) — 数字评分要稳定可复现,
 *   不让 LLM 自由发挥. 规则详见 spec §1.1 "3 维评分规则".
 */
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const FINANCE_COLUMNS = "SECUCODE,REPORT_DATE,REPORT_YEAR,ROIC,XSMLL,NETPROFIT,XSMLL_RANK";
const INDUSTRY_COLUMNS = "INDUSTRY_NAME,TOTAL,ROIC_MEDIAN,XSMLL_MEDIAN";
const MOAT_TIMEOUT_MS = 8000;

async function fetchMoatScore(httpClient, { code }) {
  // 并行拉 2 个 datacenter 接口
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const financeFilter = encodeURIComponent(`(SECUCODE="${secucode}")`);
  const financeUrl = `${DATACENTER_URL}?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=${FINANCE_COLUMNS}&filter=${financeFilter}&pageNumber=1&pageSize=5&sortColumns=REPORT_DATE&sortTypes=-1&source=HSF10&client=PC`;
  const industryFilter = encodeURIComponent(`(SECUCODE="${secucode}")`);
  const industryUrl = `${DATACENTER_URL}?reportName=RPT_PCF10_INDUSTRY_EVALUATION&columns=${INDUSTRY_COLUMNS}&filter=${industryFilter}&pageNumber=1&pageSize=1&source=F10&client=PC`;

  let financeRes, industryRes;
  try {
    [financeRes, industryRes] = await Promise.all([
      httpClient.get(financeUrl, { timeout: MOAT_TIMEOUT_MS }),
      httpClient.get(industryUrl, { timeout: MOAT_TIMEOUT_MS }),
    ]);
  } catch (e) {
    return { ok: false, reason: "fetch_failed", error: e && e.message };
  }

  if (!financeRes || !financeRes.ok || financeRes.status !== 200 || !financeRes.body) {
    return { ok: false, reason: "fetch_failed", error: "finance 接口非 200" };
  }
  if (!industryRes || !industryRes.ok || industryRes.status !== 200 || !industryRes.body) {
    return { ok: false, reason: "fetch_failed", error: "industry 接口非 200" };
  }

  // Parse finance: 区分 parse_failed (非 JSON) vs no_finance_data (空数组/缺字段)
  const financeParsed = parseDatacenterBody(financeRes.body);
  if (financeParsed === "parse_failed") {
    return { ok: false, reason: "parse_failed", error: "finance 接口 body 非 JSON" };
  }
  const financeRows = financeParsed;

  // Parse industry: 同上
  const industryParsed = parseDatacenterBody(industryRes.body);
  if (industryParsed === "parse_failed") {
    return { ok: false, reason: "parse_failed", error: "industry 接口 body 非 JSON" };
  }
  const industryRows = industryParsed;

  if (industryRows.length === 0) return { ok: false, reason: "no_industry_data", error: "industry 接口 result.data 为空" };
  if (financeRows.length === 0) return { ok: false, reason: "no_finance_data", error: "finance 接口 result.data 为空" };

  const industryRow = industryRows[0];
  if (!industryRow.INDUSTRY_NAME) return { ok: false, reason: "no_industry_data", error: "industry row 缺 INDUSTRY_NAME" };
  const industryRoicMedian = num(industryRow.ROIC_MEDIAN);
  const industryGrossMarginMedian = num(industryRow.XSMLL_MEDIAN);
  const industryTotal = num(industryRow.TOTAL);

  // 最新一年的财务 (sortTypes=-1, 第一条)
  const latest = financeRows[0];
  const roic = num(latest.ROIC);
  const grossMargin = num(latest.XSMLL);

  // ponytail: 用 financeRows 中所有 XSMLL 算自身 70 分位 (datacenter pageSize=5,
  //   实际返回 3-5 行). 用线性插值 (linear interpolation), 跟 numpy.percentile 默认方法一致.
  const marginHistory = financeRows.map((r) => num(r.XSMLL)).filter((v) => v != null);
  const selfGrossMarginP70 = percentile(marginHistory, 0.7);

  // 营收 5 年 CAGR: 用 NETPROFIT 序列 (NETPROFIT 跟营收高度相关, 简化用一个字段)
  // 真实生产可换营收 (XSREVENUE), 暂用 NETPROFIT
  const profits = financeRows
    .map((r) => num(r.NETPROFIT))
    .filter((v) => v != null && v > 0)
    .sort((a, b) => b - a); // 最新在前
  const revenueCagr5y = computeCagr(profits);

  // 排名稳定性: 极差
  const ranks = financeRows.map((r) => num(r.XSMLL_RANK)).filter((v) => v != null);
  const rankRange = ranks.length >= 2 ? Math.max(...ranks) - Math.min(...ranks) : 999;

  // 3 维评分
  const marginEdge = scoreMarginEdge(grossMargin, industryGrossMarginMedian, roic, industryRoicMedian, selfGrossMarginP70);
  const roicEdge = scoreRoicEdge(roic, industryRoicMedian);
  const revenueStability = scoreRevenueStability(rankRange, revenueCagr5y);

  const score = marginEdge + roicEdge + revenueStability;
  const missingDims = [];
  if (grossMargin == null || industryGrossMarginMedian == null) missingDims.push("毛利");
  if (roic == null || industryRoicMedian == null) missingDims.push("ROIC");
  if (ranks.length < 2) missingDims.push("营收稳定度");
  const note = buildNote(score, missingDims);

  return {
    ok: true,
    data: {
      score,
      breakdown: { marginEdge, roicEdge, revenueStability },
      metrics: {
        grossMargin,
        industryGrossMarginMedian,
        roic,
        industryRoicMedian,
        revenueCagr5y,
        revenueRankInIndustry: ranks[0] || null,
        industryTotal,
      },
      note,
    },
  };
}

function scoreMarginEdge(thisMargin, industryMedian, thisRoic, industryRoicMedian, selfP70) {
  if (thisMargin == null || industryMedian == null) return 0;
  const diff = thisMargin - industryMedian;
  // tier 2/3 gate: 当前毛利率 ≥ 自身近 3 年 70 分位 (用线性插值的 percentile)
  const tier23Gate = selfP70 != null && thisMargin >= selfP70;
  // tier 1 gate: ROIC > 行业中位 (跟毛利率是不同维度)
  const tier1Gate = thisRoic != null && industryRoicMedian != null && thisRoic > industryRoicMedian;
  if (diff > 20 && tier23Gate) return 3;
  if (diff > 10 && tier23Gate) return 2;
  if (diff > 0 && tier1Gate) return 1;
  return 0;
}

function scoreRoicEdge(thisRoic, industryMedian) {
  if (thisRoic == null || industryMedian == null) return 0;
  const diff = thisRoic - industryMedian;
  if (diff > 10) return 3;
  if (diff > 5) return 2;
  if (diff > 0) return 1;
  return 0;
}

function scoreRevenueStability(rankRange, cagr) {
  if (cagr == null) return 0;
  const isStable = rankRange <= 2;
  if (isStable && cagr > 10) return 3;
  if (isStable && cagr > 0) return 2;
  if (cagr > 5) return 1;
  return 0;
}

function computeCagr(sortedProfitsDesc) {
  if (sortedProfitsDesc.length < 2) return null;
  const latest = sortedProfitsDesc[0];
  const earliest = sortedProfitsDesc[sortedProfitsDesc.length - 1];
  const years = sortedProfitsDesc.length - 1;
  if (earliest <= 0) return null;
  return ((Math.pow(latest / earliest, 1 / years) - 1) * 100);
}

// 线性插值的 percentile (跟 numpy.percentile 默认 linear 方法一致).
// 对 3 元素数组: idx = 0.7 * 2 = 1.4 → sorted[1] + 0.4*(sorted[2]-sorted[1]).
function percentile(arr, p) {
  const sorted = arr.filter((v) => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// 解析 datacenter 响应 body: 返回 array (rows) 或字符串标记.
// "parse_failed" = body 是字符串但 JSON.parse 失败.
// [] = body 解析成功但 result.data 不是数组 / 是空数组 / 没字段.
function parseDatacenterBody(body) {
  let parsed = body;
  if (typeof body === "string") {
    parsed = safeJson(body);
    if (parsed === null) return "parse_failed";
  }
  if (parsed && parsed.result && Array.isArray(parsed.result.data)) {
    return parsed.result.data;
  }
  return [];
}

function buildNote(score, missingDims) {
  if (missingDims.length > 0) return `数据缺失 ${missingDims.join("/")} 维度`;
  if (score >= 7) return "毛利 + ROIC 双优势, 营收稳定, 强护城河";
  if (score >= 5) return "有护城河, 关注薄弱维度";
  if (score >= 3) return "护城河一般, 部分维度有优势";
  return "无护城河";
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = { fetchMoatScore };