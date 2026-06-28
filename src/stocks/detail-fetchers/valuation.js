/**
 * valuation angle fetcher.
 * ponytail: 旧逻辑用 f60/f116 算 price, 但 f60 单位会变 (送股/回购),
 *          跟实时价差 24%. 改用 push2 (F10 同 host, 实时) 的 f43 (厘单位当前价).
 *          EPS/BPS 走 datacenter MAINFINADATA, 跟 profitability 共用接口.
 */
const f10 = require("./_shared-f10");

const PUSH2_URL = "https://push2.eastmoney.com/api/qt/stock/get";
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";

async function fetchValuation(httpClient, { code }) {
  // 1) 实时价 + 总股本走 push2 (F10 同 host)
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  const priceUrl = `${PUSH2_URL}?secid=${secid}&fields=f43,f60,f116`;
  let price = null;
  try {
    const res = await httpClient.get(priceUrl);
    if (res && res.status === 200 && res.body) {
      const body =
        typeof res.body === "string" ? safeJsonParse(res.body) : res.body;
      const d = body && body.data;
      if (d) {
        // f43 单位 = 厘 (×100), 转为元
        const rawPrice = Number(d.f43);
        if (Number.isFinite(rawPrice) && rawPrice > 0) price = rawPrice / 100;
      }
    }
  } catch (_) {
    /* fall through */
  }

  // 2) EPS / BPS 走 datacenter MAINFINADATA
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const filter = encodeURIComponent(`(SECUCODE="${secucode}")`);
  const finUrl = `${DATACENTER_URL}?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=SECUCODE,REPORT_DATE,EPSXS,BPS&filter=${filter}&pageNumber=1&pageSize=1&sortColumns=REPORT_DATE&sortTypes=-1&source=HSF10&client=PC`;
  try {
    const res = await httpClient.get(finUrl);
    if (res && res.status === 200 && res.body) {
      const body =
        typeof res.body === "string" ? safeJsonParse(res.body) : res.body;
      const row =
        body && body.result && body.result.data && body.result.data[0];
      if (row && price) {
        const eps = num(row.EPSXS);
        const bvps = num(row.BPS);
        return {
          ok: true,
          data: {
            pe: eps ? price / eps : null,
            pb: bvps ? price / bvps : null,
            pePercentile3y: null,
          },
        };
      }
    }
  } catch (_) {
    /* fall through */
  }

  return {
    ok: false,
    reason: "fetch_failed",
    error: "fetch error",
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

module.exports = { fetchValuation };
