/**
 * src/main/wechat-hot/fetcher.js
 *
 * IO: 拉取微博热搜, 调 list-parser 归一化, 返回 WechatHotPayload.
 * 主源 xxapi (简单, 无 anti-bot), fallback 微博官方 ajax (需 Referer).
 *
 * v2.24.1:
 *   - 主: https://v2.xxapi.cn/api/weibohot (返 { code:200, data:[...] })
 *   - fallback: https://weibo.com/ajax/side/hotSearch (返 { ok:1, data:{ realtime:[{word,num,...}], hotgov:{...} } })
 *
 * 不导入 electron / node:http — 边界在 cache.js / register-wechat-hot.js.
 */

const { parseWechatHotPayload } = require("./list-parser.js");

const SOURCE_PRIMARY = "xxapi";
const SOURCE_FALLBACK = "weibo.com";
const URL_PRIMARY = "https://v2.xxapi.cn/api/weibohot";
const URL_FALLBACK = "https://weibo.com/ajax/side/hotSearch";
const DEFAULT_TIMEOUT_MS = 10000;
const FALLBACK_HEADERS = {
  Referer: "https://weibo.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
};

/**
 * @param {object} args
 * @param {{ get: Function }} args.httpClient  — Pulse 的 HttpClient
 * @param {number} [args.timeoutMs=10000]
 * @returns {Promise<{items: object[], fetchedAt: number, source: string}>}
 */
async function fetchWechatHot({ httpClient, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!httpClient || typeof httpClient.get !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }

  // 主源 xxapi
  try {
    const items = await fetchAndParsePrimary(httpClient, timeoutMs);
    return { items, fetchedAt: Date.now(), source: SOURCE_PRIMARY };
  } catch (primaryErr) {
    // xxapi 失败 → 试 fallback (微博官方)
    try {
      const items = await fetchAndParseFallback(httpClient, timeoutMs);
      return { items, fetchedAt: Date.now(), source: SOURCE_FALLBACK };
    } catch (fallbackErr) {
      // fallback 也失败 → 抛主源错误(reason 已正确分类)
      throw primaryErr;
    }
  }
}

async function fetchAndParsePrimary(httpClient, timeoutMs) {
  const res = await httpClient.get(URL_PRIMARY, { timeout: timeoutMs });
  if (res && (res.error === "timeout" || res.error === "network")) {
    throw withReason("http_timeout", res.error);
  }
  if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) {
    throw withReason("fetch_failed", `xxapi status=${res && res.status}`);
  }
  let raw;
  try {
    raw = JSON.parse(res.body);
  } catch {
    throw withReason("parse_failed", "xxapi json parse threw");
  }
  return parseWechatHotPayload(raw); // throws parse_failed
}

async function fetchAndParseFallback(httpClient, timeoutMs) {
  const res = await httpClient.get(URL_FALLBACK, {
    timeout: timeoutMs,
    headers: FALLBACK_HEADERS,
  });
  if (res && (res.error === "timeout" || res.error === "network")) {
    throw withReason("http_timeout", `weibo.com ${res.error}`);
  }
  if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) {
    throw withReason("fetch_failed", `weibo.com status=${res && res.status}`);
  }
  let raw;
  try {
    raw = JSON.parse(res.body);
  } catch {
    throw withReason("parse_failed", "weibo.com json parse threw");
  }
  return parseWeiboAjaxRealtime(raw);
}

/**
 * 微博官方 ajax 返: { ok:1, data:{ realtime:[{word,num,label_name?,...}], hotgovs?, hotgov? } }
 * 提取 realtime 数组, 标准化为 WechatHotItem.
 */
function parseWeiboAjaxRealtime(raw) {
  if (!raw || typeof raw !== "object") {
    throw withReason("parse_failed", "weibo.com payload not object");
  }
  if (raw.ok !== 1) {
    throw withReason("parse_failed", `weibo.com ok=${raw.ok}`);
  }
  const realtime = raw.data && Array.isArray(raw.data.realtime) ? raw.data.realtime : null;
  if (!realtime) {
    throw withReason("parse_failed", "weibo.com data.realtime missing");
  }
  const items = [];
  let rank = 1;
  for (const entry of realtime) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.word !== "string" || entry.word.length === 0) continue;
    const item = {
      rank: rank++,
      title: entry.word,
      url: buildWeiboSearchUrl(entry.word),
    };
    if (typeof entry.num === "number") {
      item.heat = formatHeatNumber(entry.num);
    }
    if (typeof entry.label_name === "string" && entry.label_name.length > 0) {
      item.tag = entry.label_name;
    }
    items.push(item);
    if (items.length >= 50) break; // 限制 50 条
  }
  if (items.length === 0) {
    throw withReason("parse_failed", "weibo.com realtime empty");
  }
  return items;
}

function buildWeiboSearchUrl(word) {
  // 微博热搜 URL 不在 payload 里, 用搜索 URL 近似跳转
  const q = encodeURIComponent(word);
  return `https://s.weibo.com/weibo?q=${q}`;
}

function formatHeatNumber(n) {
  if (n >= 10000) return `${Math.round(n / 10000)}万`;
  return String(n);
}

function withReason(reason, msg) {
  const err = new Error(`wechat-hot: ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

module.exports = {
  fetchWechatHot,
  parseWeiboAjaxRealtime,
  SOURCE_PRIMARY,
  SOURCE_FALLBACK,
  URL_PRIMARY,
  URL_FALLBACK,
};