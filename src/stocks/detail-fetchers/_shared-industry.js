/**
 * src/stocks/detail-fetchers/_shared-industry.js
 *
 * 行业成员共享 helper (peer-compare / moat-score 共用).
 *
 * 东财 RPT_PCF10_INDUSTRY_EVALUATION 报表已下线 → 改用 RPT_LICO_FN_CPD 两步流程:
 *   1) secucode 查 BOARD_CODE + BOARD_NAME (本股所属行业板块)
 *   2) BOARD_CODE 查行业成员 (ROE/毛利率/营收/净利, pageSize=50)
 *
 * 本 helper 只负责拉数据 + 字段映射, 不算中位/排名 (交给调用方客户端算,
 * 因为 moat 和 peer 各自要的统计量不同).
 *
 * 返回 { ok, data } 或 { ok:false, reason, error }.
 * data = {
 *   industry,  // BOARD_NAME 行业中文名
 *   boardCode, // BKxxxx
 *   peers,     // [{ code, name, roe, grossMargin, revenue, netprofit }]
 * }
 */
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const INDUSTRY_TIMEOUT_MS = 8000;
const PEER_PAGE_SIZE = 50;

async function fetchIndustryPeers(httpClient, code) {
  const secucode = toSecucode(code);

  // 步骤 1: secucode → BOARD_CODE + BOARD_NAME
  const boardFilter = encodeURIComponent(`(SECUCODE="${secucode}")(ISNEW="1")`);
  const boardUrl =
    `${DATACENTER_URL}?reportName=RPT_LICO_FN_CPD` +
    `&columns=BOARD_CODE,BOARD_NAME` +
    `&filter=${boardFilter}&pageSize=1&source=HSF10&client=PC`;

  let boardRes;
  try {
    boardRes = await httpClient.get(boardUrl, { timeout: INDUSTRY_TIMEOUT_MS });
  } catch (e) {
    return { ok: false, reason: "fetch_failed", error: e && e.message };
  }
  if (!boardRes || boardRes.status !== 200 || !boardRes.body) {
    return { ok: false, reason: "fetch_failed", error: "board 接口非 200" };
  }
  const boardParsed = parseDatacenterBody(boardRes.body);
  if (boardParsed === "parse_failed") {
    return { ok: false, reason: "parse_failed", error: "board 接口 body 非 JSON" };
  }
  if (boardParsed.length === 0) {
    return { ok: false, reason: "no_industry_data", error: "board 接口 result.data 为空" };
  }
  const boardRow = boardParsed[0];
  const boardCode = boardRow.BOARD_CODE;
  const industry = boardRow.BOARD_NAME;
  if (!boardCode || !industry) {
    return { ok: false, reason: "no_industry_data", error: "board row 缺 BOARD_CODE/BOARD_NAME" };
  }

  // 步骤 2: BOARD_CODE → 行业成员
  const memberFilter = encodeURIComponent(`(BOARD_CODE="${boardCode}")(ISNEW="1")`);
  const memberUrl =
    `${DATACENTER_URL}?reportName=RPT_LICO_FN_CPD` +
    `&columns=SECUCODE,SECURITY_NAME_ABBR,WEIGHTAVG_ROE,XSMLL,TOTAL_OPERATE_INCOME,PARENT_NETPROFIT` +
    `&filter=${memberFilter}&pageSize=${PEER_PAGE_SIZE}&source=HSF10&client=PC`;

  let memberRes;
  try {
    memberRes = await httpClient.get(memberUrl, { timeout: INDUSTRY_TIMEOUT_MS });
  } catch (e) {
    return { ok: false, reason: "fetch_failed", error: e && e.message };
  }
  if (!memberRes || memberRes.status !== 200 || !memberRes.body) {
    return { ok: false, reason: "fetch_failed", error: "member 接口非 200" };
  }
  const memberParsed = parseDatacenterBody(memberRes.body);
  if (memberParsed === "parse_failed") {
    return { ok: false, reason: "parse_failed", error: "member 接口 body 非 JSON" };
  }
  if (memberParsed.length === 0) {
    return { ok: false, reason: "no_industry_data", error: "member 接口 result.data 为空" };
  }

  const peers = memberParsed.map((r) => ({
    code: stripMarket(r.SECUCODE),
    name: r.SECURITY_NAME_ABBR || null,
    // WEIGHTAVG_ROE = 加权 ROE, 近似 ROIC (调用方需注意是 ROE 近似)
    roe: num(r.WEIGHTAVG_ROE),
    grossMargin: num(r.XSMLL),
    revenue: num(r.TOTAL_OPERATE_INCOME),
    netprofit: num(r.PARENT_NETPROFIT),
  }));

  return { ok: true, data: { industry, boardCode, peers } };
}

// ── helpers ──────────────────────────────────────────────────────────────────

// code (6 位) → secucode (600519.SH / 000001.SZ). 6 开头沪, 其余深.
function toSecucode(code) {
  return `${code}.${String(code).startsWith("6") ? "SH" : "SZ"}`;
}

// secucode "600519.SH" → "600519"
function stripMarket(secucode) {
  if (!secucode) return null;
  return String(secucode).split(".")[0];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 解析 datacenter 响应 body: 返回 array (rows) 或字符串标记.
// "parse_failed" = body 是字符串但 JSON.parse 失败.
// [] = body 解析成功但 result.data 不是数组 / 是空数组.
function parseDatacenterBody(body) {
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch (_) {
      return "parse_failed";
    }
  }
  if (parsed && parsed.result && Array.isArray(parsed.result.data)) {
    return parsed.result.data;
  }
  return [];
}

module.exports = { fetchIndustryPeers };
