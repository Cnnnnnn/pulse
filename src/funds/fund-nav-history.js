// src/funds/fund-nav-history.js
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const REF = "https://fundf10.eastmoney.com/";

function parseLsjzResponse(json) {
  const list = json && json.Data && Array.isArray(json.Data.LSJZList) ? json.Data.LSJZList : null;
  if (!list) throw new Error("unexpected lsjz shape");
  const out = [];
  for (const row of list) {
    const nav = parseFloat(row.DWJZ);
    if (!row.FSRQ || !Number.isFinite(nav)) continue; // 过滤无效
    out.push({ date: String(row.FSRQ), nav });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

async function fetchFundNavHistory(code, httpClient, opts = {}) {
  if (!/^\d{6}$/.test(String(code || ""))) return { ok: false, series: [], reason: "invalid_code" };
  const days = opts.days || 30;
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=${days}`;
  try {
    const r = await httpClient.get(url, {
      headers: { "User-Agent": UA, Referer: REF },
      timeout: opts.timeoutMs ?? 8000,
    });
    if (r.error === "network" || r.error === "timeout") return { ok: false, series: [], reason: r.error };
    if (r.status !== 200) return { ok: false, series: [], reason: `HTTP ${r.status}` };
    const series = parseLsjzResponse(JSON.parse(r.body || "{}"));
    return { ok: true, series, reason: null };
  } catch (e) {
    return { ok: false, series: [], reason: e && e.message ? e.message : String(e) };
  }
}

module.exports = { parseLsjzResponse, fetchFundNavHistory };
