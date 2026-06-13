/**
 * src/funds/fund-fetcher.js
 *
 * 拉基金净值 —— 纯包装 + JSONP 解包, 无业务副作用.
 *
 * 数据源: 天天基金 fundgz.1234567.com.cn
 *   URL:    http://fundgz.1234567.com.cn/js/{code}.js
 *   格式:   jsonpgz({...JSON...});
 *   字段:   fundcode / name / jzrq / dwjz / gsz / gszzl / gztime
 *
 * v1.0 (2026-06-12) — 初版
 */

/**
 * 拉单只基金的当前净值/估值.
 *
 * @param {string} code        6 位基金代码, e.g. "000001"
 * @param {{ get: (url, opts) => Promise<{status:number, body:string, headers:object, error?:string}> }} httpClient
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{
 *   code: string,
 *   name: string,
 *   nav: number,             // 上一个交易日单位净值 (确认值)
 *   estimatedNav: number | null,  // 今日盘中估值
 *   dayChange: number,       // 今日涨跌额 (estimatedNav - nav, 0 if 没法算)
 *   dayChangePct: number,    // 今日涨跌幅 (%)
 *   navDate: string,         // 净值日期 "2026-06-11"
 *   estimateTime: string | null,  // 估值时间 "2026-06-12 14:55"
 *   estimated: boolean,      // true = 当日盘中估值; false = 上一交易日确认值
 * }>}
 */
async function fetchFundNav(code, httpClient, opts = {}) {
  if (!/^\d{6}$/.test(String(code || ""))) {
    throw new Error(`invalid fund code: ${code}`);
  }
  const url = `http://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
  const r = await httpClient.get(url, {
    headers: { "User-Agent": UA },
    timeout: opts.timeoutMs ?? 8000,
  });

  if (r.error === "network") throw new Error(`network error for ${code}`);
  if (r.error === "timeout") throw new Error(`timeout for ${code}`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${code}`);
  if (!r.body || !r.body.length) throw new Error(`empty body for ${code}`);

  const parsed = parseJsonpgz(r.body);
  if (!parsed) throw new Error(`bad JSONP for ${code}: ${r.body.slice(0, 80)}`);

  return mapFundData(parsed);
}

/**
 * 批量拉多只基金的净值, 并发 4 只, 单只失败不阻塞其他.
 *
 * @param {string[]} codes
 * @param {object} httpClient
 * @param {{ timeoutMs?: number, concurrency?: number }} [opts]
 * @returns {Promise<{ results: Record<string, any>, errors: Record<string, string> }>}
 */
async function fetchFundNavBatch(codes, httpClient, opts = {}, health) {
  const concurrency = opts.concurrency ?? 4;
  const results = {};
  const errors = {};
  let i = 0;

  async function worker() {
    while (i < codes.length) {
      const idx = i++;
      const code = codes[idx];
      try {
        results[code] = await fetchFundNavWithAlt(
          code,
          httpClient,
          opts,
          health,
        );
      } catch (e) {
        errors[code] = e && e.message ? e.message : String(e);
      }
    }
  }

  const workers = [];
  for (let k = 0; k < concurrency; k++) workers.push(worker());
  await Promise.all(workers);

  return { results, errors };
}

// ── 纯函数: JSONP 解包 + 字段映射 ──

/**
 * 解析天天基金 JSONP 响应.
 * 输入: 'jsonpgz({"fundcode":"000001",...});'
 * 输出: { fundcode, name, jzrq, dwjz, gsz, gszzl, gztime } 或 null
 */
function parseJsonpgz(body) {
  if (typeof body !== "string") return null;
  // 容忍: jsonpgz({...}); 或 jsonpgz({...})  (无尾分号, 容错)
  const m = body.match(/jsonpgz\s*\(\s*(\{[\s\S]*?\})\s*\)\s*;?\s*$/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/**
 * 把 JSONP 解析出来的对象映射成 UI 用的标准结构.
 */
function mapFundData(raw) {
  const nav = parseFloat(raw.dwjz); // 上一交易日单位净值 (确认值)
  const estimatedNav = parseFloat(raw.gsz); // 今日盘中估值
  const dayChangePct = parseFloat(raw.gszzl); // 今日涨跌幅 %

  const safeNav = Number.isFinite(nav) ? nav : 0;
  const safeEst = Number.isFinite(estimatedNav) ? estimatedNav : null;
  const safePct = Number.isFinite(dayChangePct) ? dayChangePct : 0;
  const dayChange = safeEst != null ? +(safeEst - safeNav).toFixed(4) : 0;

  // estimated: 当 gztime 是今天 → 盘中; 否则只显示确认值
  const estimated = !!(raw.gztime && isTodayLocal(raw.gztime));

  return {
    code: raw.fundcode,
    name: raw.name,
    source: "tiantian",
    nav: safeNav,
    estimatedNav: safeEst,
    dayChange,
    dayChangePct: safePct,
    navDate: raw.jzrq,
    estimateTime: raw.gztime || null,
    estimated,
  };
}

function isTodayLocal(s) {
  // s 格式 "2026-06-12 14:55" 或 "2026-06-12"
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const d = new Date();
  return (
    d.getFullYear() === +m[1] &&
    d.getMonth() + 1 === +m[2] &&
    d.getDate() === +m[3]
  );
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const { fetchFundNavSina } = require("./fund-fetcher-sina");
const { attachAltNav } = require("./fund-nav-merge");
const { mainLog } = require("../main/log");

/**
 * 主源 + 备用源 + fallback.
 *
 * 行为:
 *   1) 拉主源 (tiantian)
 *   2) 拉备用源 (sina), 挂到 altNav 字段 (供交叉比对 / 用户切换)
 *   3) 如果主源失败 (抛错或返回无效 nav), 用备用源整体兜底:
 *      - 把备用源当成主结果返回 (source 仍是备用源, 但 fields 齐全)
 *      - 标 fallbackFrom: 'tiantian' 给日志/UI 看
 *   4) 双源都失败 → 抛主源的错 (保持原 throw 语义, scheduler 收得到)
 *
 * @param {string} code
 * @param {object} httpClient
 * @param {{ timeoutMs?: number, altSource?: boolean, logger?: object }} [opts]
 * @param {{ record?: (source: string, ok: boolean, code?: string) => void }} [health]
 *   注入健康度记录器 (NavSourceHealth 实例). 不传则只走日志.
 */
async function fetchFundNavWithAlt(code, httpClient, opts = {}, health) {
  const logger = (opts && opts.logger) || mainLog;
  let primary = null;
  let primaryErr = null;
  try {
    primary = await fetchFundNav(code, httpClient, opts);
    if (health && typeof health.record === "function") {
      health.record("tiantian", true, code);
    }
  } catch (e) {
    primaryErr = e;
    if (health && typeof health.record === "function") {
      health.record("tiantian", false, code);
    }
    try {
      logger.warn(
        `[fund-fetcher] tiantian failed for ${code}: ${e && e.message}`,
      );
    } catch {
      /* noop */
    }
  }

  let alt = null;
  let altErr = null;
  if (opts && opts.altSource === false) {
    // 显式禁用备用源
  } else {
    try {
      alt = await fetchFundNavSina(code, httpClient, opts);
      if (health && typeof health.record === "function") {
        health.record("sina", true, code);
      }
    } catch (e) {
      altErr = e;
      if (health && typeof health.record === "function") {
        health.record("sina", false, code);
      }
      try {
        logger.debug(
          `[fund-fetcher] sina failed for ${code}: ${e && e.message}`,
        );
      } catch {
        /* noop */
      }
    }
  }

  // 主源失败 → 用备用源整体兜底 (sina → 主快照)
  if (!primary) {
    if (alt) {
      try {
        logger.info(`[fund-fetcher] fallback tiantian → sina for ${code}`);
      } catch {
        /* noop */
      }
      const fromSina = {
        code: alt.code,
        name: alt.name,
        source: "sina",
        nav: alt.nav,
        estimatedNav: alt.estimatedNav,
        dayChange: 0,
        dayChangePct: alt.dayChangePct,
        navDate: alt.navDate,
        estimateTime: null,
        estimated: !!(alt.estimatedNav != null && alt.estimatedNav > 0),
        fallbackFrom: "tiantian",
        // alt 维度都置 false, 因为这里 alt 已经升格成主快照
        primarySource: "sina",
        altSource: "sina",
        altAvailable: false,
      };
      return fromSina;
    }
    // 双源都失败 → 抛主源的错
    throw primaryErr || new Error(`both sources failed for ${code}`);
  }

  return attachAltNav(primary, alt);
}

module.exports = {
  fetchFundNav,
  fetchFundNavWithAlt,
  fetchFundNavBatch,
  parseJsonpgz,
  mapFundData,
};
