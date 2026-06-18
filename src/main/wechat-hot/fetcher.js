/**
 * src/main/wechat-hot/fetcher.js
 *
 * IO: 通过注入的 HttpClient 拉取 tenhot 微信热搜 API,
 *      调 list-parser 归一化, 返回 WechatHotPayload.
 *
 * 不导入 electron / node:http — 边界在 cache.js / register-wechat-hot.js.
 */

const { parseWechatHotPayload } = require("./list-parser.js");

const SOURCE = "tenhot";
const URL = "https://tenhot-api.vercel.app/api/hotsearch/wxrank";
const DEFAULT_TIMEOUT_MS = 10000;

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
  const res = await httpClient.get(URL, { timeout: timeoutMs });
  if (res && (res.error === "timeout" || res.error === "network")) {
    throw withReason("http_timeout", res.error);
  }
  if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) {
    throw withReason("fetch_failed", `status=${res && res.status}`);
  }
  let raw;
  try {
    raw = JSON.parse(res.body);
  } catch {
    throw withReason("parse_failed", "json parse threw");
  }
  const items = parseWechatHotPayload(raw); // throws parse_failed
  return { items, fetchedAt: Date.now(), source: SOURCE };
}

function withReason(reason, msg) {
  const err = new Error(`wechat-hot: ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

module.exports = { fetchWechatHot, SOURCE, URL };
