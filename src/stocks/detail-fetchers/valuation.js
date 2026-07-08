/**
 * valuation angle fetcher.
 * ponytail: 旧逻辑用 f60/f116 算 price, 但 f60 单位会变 (送股/回购),
 *          跟实时价差 24%. 改用 push2 (F10 同 host, 实时) 的 f43 (厘单位当前价).
 *          EPS/BPS 走 datacenter MAINFINADATA, 跟 profitability 共用接口.
 *
 * 三级 fallback, 拿到 PE/PB 任一就 ok:
 *   1) push2 主路径: f43 (现价) + f9/f23 (PE/PB) 直接拿
 *   2) datacenter MAINFINADATA 拿 EPS/BPS + push2 现价 算 PE/PB (补 push2 缺 f9/f23 的股)
 *   3) 腾讯 qt.gtimg.cn fallback: 索引 [3]=价 [39]=PE [46]=PB, push2/datacenter 都限流时救命
 *   4) 仅现价: 返 { price, pe: null, pb: null } 至少能显示当前价
 *
 * ceiling: 腾讯 PE/PB 是动态值, 跟历史分位口径不同, 阈值保持一致但显示文字要留意.
 */
const f10 = require("./_shared-f10");

const PUSH2_URL = "https://push2.eastmoney.com/api/qt/stock/get";
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const TENCENT_URL = "https://qt.gtimg.cn/q=";

async function fetchValuation(httpClient, { code }) {
  const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
  // ponytail: 一把要 f43 (现价) + f9 (PE) + f23 (PB) + f60 (昨收), 单请求拿全.
  const priceUrl = `${PUSH2_URL}?secid=${secid}&fields=f43,f9,f23,f60,f116`;
  let price = null;
  let peDirect = null;
  let pbDirect = null;
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
        // f9 / f23 东财直接给的是 PE_TTM / PB, 不需要再除. 0 / null 视为缺.
        const peRaw = Number(d.f9);
        const pbRaw = Number(d.f23);
        if (Number.isFinite(peRaw) && peRaw > 0) peDirect = peRaw;
        if (Number.isFinite(pbRaw) && pbRaw > 0) pbDirect = pbRaw;
      }
    }
  } catch (_) {
    /* fall through */
  }

  // ponytail: 2026-07-07 — 顺序改成 push2 → tencent → datacenter, 让 tencent
  // 必跑 (push2 拿不到 PE/PB 立刻补). datacenter 拿 EPS/BPS 跟价格算 (跟 tencent 互补,
  //  缺时备用). 互不依赖, 不短路掉.
  let pe = peDirect;
  let pb = pbDirect;

  // 兜底 (1): 腾讯 qt.gtimg.cn 返 PE/PB 现价 (push2 限流时救命).
  if (pe == null || pb == null || price == null) {
    const market = code.startsWith("6") ? "sh" : "sz";
    const tencentUrl = `${TENCENT_URL}${market}${code}`;
    try {
      const res = await httpClient.get(tencentUrl);
      // 腾讯返 GBK 编码, body 是字符串如: v_sh600519="1~...~1188.80~...";
      // 我们在 httpClient 已经转 utf-8, 但名称字段会乱码; 数字字段不影响.
      if (res && res.status === 200 && res.body) {
        const body = typeof res.body === "string" ? res.body : "";
        // 提取 = "..." 中间部分
        const m = body.match(/="([^"]+)"/);
        if (m) {
          const fields = m[1].split("~");
          // 索引 (实测, 跟 [1] blog.csdn.net 文档一致):
          //   [3] 现价, [39] PE_TTM, [46] PB
          if (price == null) {
            const p = Number(fields[3]);
            if (Number.isFinite(p) && p > 0) price = p;
          }
          if (pe == null) {
            const v = Number(fields[39]);
            if (Number.isFinite(v) && v > 0) pe = v;
          }
          if (pb == null) {
            const v = Number(fields[46]);
            if (Number.isFinite(v) && v > 0) pb = v;
          }
        }
      }
    } catch (_) {
      /* fall through */
    }
  }

  // 兜底 (2): datacenter MAINFINADATA 拿 EPS/BPS 算 PE/PB (补 push2/tencent 都缺的股).
  // 不依赖 price: 缺价时仍可拿 EPS/BPS 存进 data, 但 PE/PB 算不出 (分子 = price 缺).
  if (pe == null || pb == null) {
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
        if (row && price != null) {
          if (pe == null) {
            const eps = num(row.EPSXS);
            if (eps) pe = price / eps;
          }
          if (pb == null) {
            const bvps = num(row.BPS);
            if (bvps) pb = price / bvps;
          }
        }
      }
    } catch (_) {
      /* fall through */
    }
  }

  // 至少拿到 price 或 PE/PB 任一 → ok=true. 让前端至少能显示现价.
  if (pe != null || pb != null || price != null) {
    return {
      ok: true,
      data: {
        pe: pe != null ? round2(pe) : null,
        pb: pb != null ? round2(pb) : null,
        price: price,
        pePercentile3y: null,
      },
    };
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

function round2(v) {
  return Math.round(v * 100) / 100;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

module.exports = { fetchValuation };
