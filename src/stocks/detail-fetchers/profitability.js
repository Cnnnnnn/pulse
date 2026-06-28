/**
 * profitability angle fetcher. 东财 F10 (legacy 主要指标) 优先, 2026 起 em 把
 * ROE/毛利率/净利率从 F10 拆到 datacenter MAINFINADATA 接口 — fallback 走这个.
 * sina 备援 (页面结构已死, 几乎返不到).
 */
const f10 = require("./_shared-f10");
const fb = require("./_shared-profitability-fallback");

async function fetchProfitability(httpClient, { code }) {
  const primary = await f10.fetchEastmoneyF10(httpClient, code);
  if (primary && primary.status === 200 && primary.body) {
    const out = parseF10(primary.body);
    if (
      out &&
      (out.roe != null || out.grossMargin != null || out.netMargin != null)
    ) {
      return { ok: true, data: out };
    }
  }
  // ponytail: em MAINFINADATA 接口返 ROE/毛利率/净利率, fields 跟 F10 不同
  // (ROEJQ / XSMLL / XSJLL). 需要 secucode = 代码.marketcode.
  const dc = await fetchDatacenterFinance(httpClient, code);
  if (dc.ok && dc.data) {
    return { ok: true, data: dc.data };
  }
  const sina = await fb.fetchSinaProfitability(httpClient, code);
  if (sina && sina.status === 200 && sina.body) {
    const out = fb.parseSinaProfitability(sina.body);
    if (out) return { ok: true, data: out };
  }
  const primaryOk = primary && primary.status === 200 && primary.body;
  return {
    ok: false,
    reason: primaryOk ? "parse_failed" : "fetch_failed",
    error: "fetch error",
  };
}

function parseF10(body) {
  if (!body || !body.data) return null;
  const d = body.data;
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? n : null;
  };
  return {
    roe: num(d.f37),
    grossMargin: num(d.f22),
    netMargin: num(d.f24),
    reportDate: d.reportDate || "unknown",
  };
}

const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
async function fetchDatacenterFinance(httpClient, code) {
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const filter = encodeURIComponent(`(SECUCODE="${secucode}")`);
  const url = `${DATACENTER_URL}?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=SECUCODE,REPORT_DATE,ROEJQ,XSMLL,XSJLL&filter=${filter}&pageNumber=1&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1&source=HSF10&client=PC`;
  try {
    const res = await httpClient.get(url);
    if (!res || res.status !== 200 || !res.body) {
      return { ok: false };
    }
    const body =
      typeof res.body === "string" ? safeJsonParse(res.body) : res.body;
    const row = body && body.result && body.result.data && body.result.data[0];
    if (!row) return { ok: false };
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n !== 0 ? n : null;
    };
    return {
      ok: true,
      data: {
        roe: num(row.ROEJQ),
        grossMargin: num(row.XSMLL),
        netMargin: num(row.XSJLL),
        reportDate: (row.REPORT_DATE || "").slice(0, 10) || "unknown",
      },
    };
  } catch (_) {
    return { ok: false };
  }
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

module.exports = { fetchProfitability };
