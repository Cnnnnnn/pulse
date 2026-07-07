/**
 * src/stocks/detail-fetchers/shareholders.js
 *
 * shareholders angle fetcher. 股东人数 + 机构持仓 (东方财富数据中心).
 *
 * ponytail: 两个并行查询, 任意一个 OK 就视为该 angle 整体 OK. 都不 OK 才算失败.
 * (因为部分小盘股机构持仓 0 披露, 拿不到不等于出错.)
 *
 * data = {
 *   holderCountLatest, holderCountPrev, holderCountChangePct,
 *   reportDate,                       // 股东人数最新季报
 *   institutionPctLatest, institutionPctPrev, institutionChangePct,
 *   institutionReportDate,            // 机构持仓最新季报
 * }
 */
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";

async function fetchShareholders(httpClient, { code }) {
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const filter = encodeURIComponent(`(SECUCODE="${secucode}")`);

  // ponytail: 并行两个接口, 谁先 OK 用谁的, 都失败才返回 failed.
  const [holder, institution] = await Promise.all([
    fetchHolderCount(httpClient, filter),
    fetchInstitutionPct(httpClient, filter),
  ]);

  if (!holder && !institution) {
    // ponytail: 2026-07-07 周末/节假日股东季报数据中心接口经常返空.
    // 不算 fetcher 失败 (季报本来就季度披露), 但也没数据. 返 ok:true + noData:true.
    return {
      ok: true,
      data: { noData: true, reason: "周末/非披露期股东数据为空" },
    };
  }

  return {
    ok: true,
    data: {
      holderCountLatest: holder ? holder.latest : null,
      holderCountPrev: holder ? holder.prev : null,
      holderCountChangePct: holder
        ? pctChange(holder.latest, holder.prev)
        : null,
      reportDate: holder ? holder.reportDate : null,
      institutionPctLatest: institution ? institution.latest : null,
      institutionPctPrev: institution ? institution.prev : null,
      institutionChangePct: institution
        ? pctChange(institution.latest, institution.prev)
        : null,
      institutionReportDate: institution ? institution.reportDate : null,
    },
  };
}

// RPT_F10_EH_PER: 股东人数, 字段 HOLDNUM (最新 + 上一期), END_DATE.
async function fetchHolderCount(httpClient, filter) {
  const url =
    `${DATACENTER_URL}?reportName=RPT_F10_EH_PER` +
    `&columns=ALL&filter=${filter}&pageNumber=1&pageSize=2` +
    `&sortColumns=END_DATE&sortTypes=-1&source=HSF10&client=PC`;
  let res;
  try {
    res = await httpClient.get(url, { timeout: 8000 });
  } catch (_) {
    return null;
  }
  if (!res || res.status !== 200 || !res.body) return null;
  const body = typeof res.body === "string" ? safeJson(res.body) : res.body;
  const rows =
    body && body.result && Array.isArray(body.result.data)
      ? body.result.data
      : [];
  if (rows.length === 0) return null;
  const latest = rows[0];
  const prev = rows[1] || null;
  return {
    latest: num(latest.HOLDNUM),
    prev: prev ? num(prev.HOLDNUM) : null,
    reportDate: (latest.END_DATE || "").slice(0, 10) || null,
  };
}

// RPT_F10_SHAREHOLDER_SDJZ: 机构持股比例, 字段 ORG_HOLD_RATIO.
async function fetchInstitutionPct(httpClient, filter) {
  const url =
    `${DATACENTER_URL}?reportName=RPT_F10_SHAREHOLDER_SDJZ` +
    `&columns=ALL&filter=${filter}&pageNumber=1&pageSize=2` +
    `&sortColumns=END_DATE&sortTypes=-1&source=HSF10&client=PC`;
  let res;
  try {
    res = await httpClient.get(url, { timeout: 8000 });
  } catch (_) {
    return null;
  }
  if (!res || res.status !== 200 || !res.body) return null;
  const body = typeof res.body === "string" ? safeJson(res.body) : res.body;
  const rows =
    body && body.result && Array.isArray(body.result.data)
      ? body.result.data
      : [];
  if (rows.length === 0) return null;
  const latest = rows[0];
  const prev = rows[1] || null;
  return {
    latest: num(latest.ORG_HOLD_RATIO),
    prev: prev ? num(prev.ORG_HOLD_RATIO) : null,
    reportDate: (latest.END_DATE || "").slice(0, 10) || null,
  };
}

function pctChange(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

module.exports = { fetchShareholders };
