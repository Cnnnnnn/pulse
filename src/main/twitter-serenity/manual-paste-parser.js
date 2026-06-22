/**
 * src/main/twitter-serenity/manual-paste-parser.js
 *
 * 降级路径: 用户手动粘贴 (spec §5.4). 3 类输入:
 *   1. X URL:      https?://(x|twitter).com/{handle}/status/{id}
 *   2. Nitter URL: https?://{host}/{handle}/status/{id}  (host 非 x/twitter)
 *   3. 纯文本:      无 URL 命中, id = 'manual-' + sha1(text).slice(0,16)
 *
 * 多行: 每行独立解析, 空行跳过.
 */

const crypto = require("node:crypto");

// X / twitter 域名优先匹配
const X_URL_RE = /https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/;
// Nitter 通用: host/handle/status/id, handle 不能是 "status" 或 "i" 等保留路径段
const NITTER_URL_RE = /https?:\/\/[\w.\-]+\/([A-Za-z0-9_]+)\/status\/(\d+)/;

function makeRawTweet(id, url, text, handle) {
  return {
    id,
    url,
    text,
    author: { handle, displayName: "" },
    publishedAt: null,
    media: [],
    metrics: { likes: 0, retweets: 0, replies: 0 },
    sourceMirror: "manual-paste",
  };
}

function parseLine(line) {
  const text = String(line == null ? "" : line).trim();
  if (!text) return null;

  // 1. 先试 X URL (明确 x/twitter 域)
  let m = text.match(X_URL_RE);
  if (m) {
    return makeRawTweet(m[2], m[0], text, m[1]);
  }

  // 2. 再试 Nitter URL (排除已被 X 吃掉的; handle 不能是保留路径)
  m = text.match(NITTER_URL_RE);
  if (m && m[1] !== "status" && m[1] !== "i") {
    return makeRawTweet(m[2], m[0], text, m[1]);
  }

  // 3. 纯文本
  const hash = crypto
    .createHash("sha1")
    .update(text)
    .digest("hex")
    .slice(0, 16);
  return makeRawTweet(`manual-${hash}`, "", text, "unknown");
}

function parseManualPaste(input) {
  if (input == null || typeof input !== "string") {
    return { ok: true, results: [], errors: [] };
  }
  const lines = input.split(/\r?\n/);
  const results = [];
  const errors = [];
  for (const line of lines) {
    try {
      const parsed = parseLine(line);
      if (parsed) results.push(parsed);
    } catch (err) {
      errors.push({ line, error: err && err.message });
    }
  }
  return { ok: true, results, errors };
}

module.exports = { parseManualPaste, parseLine };
