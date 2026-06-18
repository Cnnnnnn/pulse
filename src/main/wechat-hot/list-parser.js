/**
 * src/main/wechat-hot/list-parser.js
 *
 * Pure: tenhot 聚合 API payload → 标准化 items.
 * 不依赖 electron / node:http / HttpClient — 方便 vitest 直接 require.
 */

/**
 * @typedef {Object} WechatHotItem
 * @property {number} rank
 * @property {string} title
 * @property {string} url
 * @property {string} [heat]
 * @property {string} [tag]
 */

/**
 * @param {unknown} raw — tenhot 原始 payload
 * @returns {WechatHotItem[]}
 * @throws {Error} reason 为 'parse_failed'
 */
function parseWechatHotPayload(raw) {
  if (!raw || typeof raw !== "object") {
    throw withReason("parse_failed", "payload not object");
  }
  if (raw.code !== 0) {
    throw withReason("parse_failed", `code=${raw.code}`);
  }
  if (!raw.data || !Array.isArray(raw.data.list)) {
    throw withReason("parse_failed", "data.list missing");
  }
  const items = [];
  let rank = 1;
  for (const entry of raw.data.list) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.title !== "string" || entry.title.length === 0) continue;
    if (typeof entry.url !== "string" || entry.url.length === 0) continue;
    const item = {
      rank: rank++,
      title: entry.title,
      url: entry.url,
    };
    if (entry.hot && typeof entry.hot === "object" && typeof entry.hot.value === "string") {
      item.heat = entry.hot.value;
    }
    if (entry.label && typeof entry.label === "object" && typeof entry.label.name === "string") {
      item.tag = entry.label.name;
    }
    items.push(item);
  }
  return items;
}

function withReason(reason, msg) {
  const err = new Error(`${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

module.exports = { parseWechatHotPayload };
