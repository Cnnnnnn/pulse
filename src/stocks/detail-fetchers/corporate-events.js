/**
 * src/stocks/detail-fetchers/corporate-events.js
 *
 * corporate_events angle fetcher. 股本事件 (分红 / 解禁 / 配股), 东方财富数据中心.
 *
 * ponytail: 三个并行子查询, 任何一个有数据就视为 angle OK. 全空 (近期无任何股本事件) 也
 * 算 ok + 空 items — 让 UI 显示"近期无股本事件".
 *
 * data = {
 *   dividends: [{ reportDate, plan, shareBonus, cashBonus }],
 *   unlocks:    [{ limitDate, shareType, limitShares, ratio }],
 *   offerings:  [{ issueDate, issueType, price, shares }],
 *   nearestUnlockDays,             // 距离下次解禁的天数 (null = 无)
 *   nextCashDividendYieldPct,      // 下次现金分红预案的股息率 (估算)
 * }
 */
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";

async function fetchCorporateEvents(httpClient, { code }) {
  const secucode = `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
  const filter = encodeURIComponent(`(SECUCODE="${secucode}")`);

  const [dividends, unlocks, offerings] = await Promise.all([
    fetchDividends(httpClient, filter),
    fetchUnlocks(httpClient, filter),
    fetchOfferings(httpClient, filter),
  ]);

  // ponytail: 三个接口都空是常态 (无新事件), 仍 ok=true 让 UI 显式说"无股本事件"
  // 跟 news_buzz 的"暂无舆情" 范式一致.
  const nearestUnlockDays =
    unlocks.length > 0 ? daysUntil(unlocks[0].limitDate) : null;
  // ponytail: 股息率需要"派现 / 当前股价", 缺股价算不准. 留 raw 派现金额 (每 10 股)
  // 字段, LLM 拿到后自己除 — 不要在 fetcher 里瞎猜除以 100.
  const latestCashBonusPer10 =
    dividends.length > 0 ? dividends[0].cashBonus : null;

  return {
    ok: true,
    data: {
      dividends,
      unlocks,
      offerings,
      nearestUnlockDays,
      latestCashBonusPer10,
    },
  };
}

// RPT_F10_DIVIDENT: 分红送配. 字段: REPORT_DATE, PLAN, SONGLIU (送股), XIANLIU (派现 / 10股).
async function fetchDividends(httpClient, filter) {
  const url =
    `${DATACENTER_URL}?reportName=RPT_F10_DIVIDENT` +
    `&columns=ALL&filter=${filter}&pageNumber=1&pageSize=4` +
    `&sortColumns=REPORT_DATE&sortTypes=-1&source=HSF10&client=PC`;
  const rows = await fetchDatacenterRows(httpClient, url);
  if (!rows) return [];
  return rows.map((row) => ({
    reportDate: (row.REPORT_DATE || "").slice(0, 10) || null,
    plan: row.PLAN || null,
    shareBonus: num(row.SONGLIU), // 每 10 股送股
    cashBonus: num(row.XIANLIU), // 每 10 股派现 (元)
  }));
}

// RPT_F10_LIFT_LIMIT: 限售解禁. 字段: LIMIT_DATE, CLASS_NAME, LIMIT_NUM, RATIO.
async function fetchUnlocks(httpClient, filter) {
  const url =
    `${DATACENTER_URL}?reportName=RPT_F10_LIFT_LIMIT` +
    `&columns=ALL&filter=${filter}&pageNumber=1&pageSize=4` +
    `&sortColumns=LIMIT_DATE&sortTypes=1&source=HSF10&client=PC`; // asc — 最近的在前
  const rows = await fetchDatacenterRows(httpClient, url);
  if (!rows) return [];
  return rows.map((row) => ({
    limitDate: (row.LIMIT_DATE || "").slice(0, 10) || null,
    shareType: row.CLASS_NAME || null,
    limitShares: num(row.LIMIT_NUM),
    ratio: num(row.RATIO), // 占总股本 %
  }));
}

// RPT_F10_RAISE: 增发 / IPO. 字段: ISSUE_DATE, RAISE_OBJECT, ISSUE_PRICE, ISSUE_NUM.
async function fetchOfferings(httpClient, filter) {
  const url =
    `${DATACENTER_URL}?reportName=RPT_F10_RAISE` +
    `&columns=ALL&filter=${filter}&pageNumber=1&pageSize=3` +
    `&sortColumns=ISSUE_DATE&sortTypes=-1&source=HSF10&client=PC`;
  const rows = await fetchDatacenterRows(httpClient, url);
  if (!rows) return [];
  return rows.map((row) => ({
    issueDate: (row.ISSUE_DATE || "").slice(0, 10) || null,
    issueType: row.RAISE_OBJECT || null,
    price: num(row.ISSUE_PRICE),
    shares: num(row.ISSUE_NUM),
  }));
}

async function fetchDatacenterRows(httpClient, url) {
  let res;
  try {
    res = await httpClient.get(url, { timeout: 8000 });
  } catch (_) {
    return null;
  }
  if (!res || res.status !== 200 || !res.body) return null;
  const body = typeof res.body === "string" ? safeJson(res.body) : res.body;
  return body && body.result && Array.isArray(body.result.data)
    ? body.result.data
    : [];
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (!Number.isFinite(target)) return null;
  const diff = target - Date.now();
  // ponytail: 负值 (已解禁) 也保留, 让 LLM 知道"刚解禁过", 不要直接 null 抹掉.
  return Math.round(diff / 86400000);
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

module.exports = { fetchCorporateEvents };
