/**
 * src/stocks/detail-fetchers/moat-score.js
 *
 * moat_score angle fetcher. 客户端算 3 维护城河评分:
 *   - marginEdge (0-3): 毛利率相对行业中位的优势
 *   - roicEdge (0-3): ROIC 相对行业中位的优势
 *   - revenueStability (0-3): 净利 CAGR + 行业营收排名
 *
 * 数据源 (东财 API 2026 变动后):
 *   - 本股财务: RPT_F10_FINANCE_MAINFINADATA, 字段 ROIC/XSMLL/PARENTNETPROFIT/TOTALOPERATEREVE
 *     (NETPROFIT/XSMLL_RANK 字段已不存在, 改 PARENTNETPROFIT + 自己算排名; 注意 MAINFINADATA 用连写命名, LICO_FN_CPD 用下划线命名)
 *   - 行业成员: fetchIndustryPeers (RPT_LICO_FN_CPD 两步), 客户端算中位/排名
 *
 * ponytail: 评分规则 hardcode 在这里 (不依赖 LLM 算) — 数字评分要稳定可复现,
 *   不让 LLM 自由发挥. 规则详见 spec §1.1 "3 维评分规则".
 *
 * ROIC 近似说明: peers 给的是 WEIGHTAVG_ROE (加权 ROE), 不是 ROIC. 本股 ROIC
 *   从 MAINFINADATA 拿 (ROIC 字段存在), 行业中位用 peers 的 WEIGHTAVG_ROE 中位
 *   近似 ROIC 中位 (ROE 与 ROIC 高度相关, 量级接近, 标注近似).
 */
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const FINANCE_COLUMNS = "SECUCODE,REPORT_DATE,REPORT_YEAR,ROIC,XSMLL,PARENTNETPROFIT,TOTALOPERATEREVE";
const MOAT_TIMEOUT_MS = 8000;

const { fetchIndustryPeers } = require("./_shared-industry");

async function fetchMoatScore(httpClient, { code }) {
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const financeFilter = encodeURIComponent(`(SECUCODE="${secucode}")`);
  const financeUrl =
    `${DATACENTER_URL}?reportName=RPT_F10_FINANCE_MAINFINADATA` +
    `&columns=${FINANCE_COLUMNS}&filter=${financeFilter}` +
    `&pageNumber=1&pageSize=5&sortColumns=REPORT_DATE&sortTypes=-1&source=HSF10&client=PC`;

  // 并行拉: 本股财务 + 行业成员
  let financeRes, industryRes;
  try {
    [financeRes, industryRes] = await Promise.all([
      httpClient.get(financeUrl, { timeout: MOAT_TIMEOUT_MS }),
      fetchIndustryPeers(httpClient, code),
    ]);
  } catch (e) {
    return { ok: false, reason: "fetch_failed", error: e && e.message };
  }

  // industry (fetchIndustryPeers 返回 {ok,data} 不是 HTTP response)
  if (!industryRes || !industryRes.ok) {
    return { ok: false, reason: (industryRes && industryRes.reason) || "fetch_failed", error: (industryRes && industryRes.error) || "industry 失败" };
  }
  // finance (HTTP response)
  if (!financeRes || financeRes.status !== 200 || !financeRes.body) {
    return { ok: false, reason: "fetch_failed", error: "finance 接口非 200" };
  }

  const financeParsed = parseDatacenterBody(financeRes.body);
  if (financeParsed === "parse_failed") {
    return { ok: false, reason: "parse_failed", error: "finance 接口 body 非 JSON" };
  }
  const financeRows = financeParsed;
  if (financeRows.length === 0) return { ok: false, reason: "no_finance_data", error: "finance 接口 result.data 为空" };

  const peers = industryRes.data.peers;
  const industry = industryRes.data.industry;
  const industryTotal = peers.length;

  // 行业中位: ROIC 用 peers 的 WEIGHTAVG_ROE 近似 (helper 已映射到 peer.roe),
  // 毛利率用 peer.grossMargin. 客户端算中位.
  const industryRoeValues = peers.map((p) => p.roe).filter((v) => v != null);
  const industryGrossValues = peers.map((p) => p.grossMargin).filter((v) => v != null);
  const industryRoicMedian = median(industryRoeValues); // 近似 ROIC 中位 (实为 ROE 中位)
  const industryGrossMarginMedian = median(industryGrossValues);

  // 最新一年的财务 (sortTypes=-1, 第一条)
  const latest = financeRows[0];
  const roic = num(latest.ROIC);
  const grossMargin = num(latest.XSMLL);

  // 自身毛利率 70 分位 (历史门): 用 financeRows 中所有 XSMLL
  const marginHistory = financeRows.map((r) => num(r.XSMLL)).filter((v) => v != null);
  const selfGrossMarginP70 = percentile(marginHistory, 0.7);

  // 净利 CAGR: 用 PARENTNETPROFIT 序列 (按 REPORT_DATE 倒序, 第一条最新)
  const profits = financeRows
    .map((r) => num(r.PARENTNETPROFIT))
    .filter((v) => v != null && v > 0)
    .sort((a, b) => b - a); // 最新在前
  const revenueCagr5y = computeCagr(profits);

  // 行业营收排名: peers 里按 revenue desc, 找本股位置.
  // 注意: peers 的 revenue 来自 LICO_FN_CPD 的 TOTAL_OPERATE_INCOME (该表用下划线命名);
  //   本股净利从 MAINFINADATA 的 PARENTNETPROFIT 拿 (该表无下划线), 字段风格不同勿混.
  const revenueRank = rankInPeers(peers, code, "revenue");

  // 3 维评分
  const marginEdge = scoreMarginEdge(grossMargin, industryGrossMarginMedian, roic, industryRoicMedian, selfGrossMarginP70);
  const roicEdge = scoreRoicEdge(roic, industryRoicMedian);
  const revenueStability = scoreRevenueStability(revenueRank, industryTotal, revenueCagr5y);

  const score = marginEdge + roicEdge + revenueStability;
  const missingDims = [];
  if (grossMargin == null || industryGrossMarginMedian == null) missingDims.push("毛利");
  if (roic == null || industryRoicMedian == null) missingDims.push("ROIC");
  if (revenueRank == null) missingDims.push("营收稳定度");
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
        revenueRankInIndustry: revenueRank,
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

// 排名稳定性: 极差越小越稳. revenueRank 是绝对排名 (1 = 最大), 用 (total - rank)
// 衡量"排得靠前". 简化: rank 在前 30% 视为稳定.
function scoreRevenueStability(rank, total, cagr) {
  if (rank == null || total == null || total === 0) {
    // 排名缺失, 退化为只看 cagr
    if (cagr == null) return 0;
    if (cagr > 10) return 2;
    if (cagr > 5) return 1;
    return 0;
  }
  const topFrac = rank / total; // 越小越靠前
  const isStable = topFrac <= 0.3; // 前 30% 视为稳定
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

// 在 peers 里按指定字段 desc 排序, 找本股的排名 (1 = 最大). 找不到返 null.
function rankInPeers(peers, code, field) {
  const sorted = peers
    .filter((p) => p[field] != null)
    .slice()
    .sort((a, b) => (b[field] || 0) - (a[field] || 0));
  const idx = sorted.findIndex((p) => p.code === code);
  return idx >= 0 ? idx + 1 : null;
}

// 中位数 (数值数组). 空数组返 null.
function median(arr) {
  const sorted = arr.filter((v) => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// 线性插值的 percentile (跟 numpy.percentile 默认 linear 方法一致).
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
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

module.exports = { fetchMoatScore };
