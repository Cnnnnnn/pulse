/**
 * src/detectors/utils.js
 *
 * detectors 共享的小工具. 之前 truncate 在 8 个 detector 里逐字复制,
 * cleanVersion 在 4 个文件里各写一份, 这里统一收口.
 *
 * cleanVersion 复用 src/utils/version-utils.js (合并后的实现兼容所有
 * detector 的 case: 引号 / 逗号 hash / v 前缀).
 */

const { cleanVersion } = require("../utils/version-utils");
const { DetectorError, REASONS } = require("./errors");

/**
 * 把超长字符串截到 n 字符 + "…". detector response body 经常上万字符,
 * 塞进 DetectorError 会爆, 用这个裁一下.
 * @param {string|null} s
 * @param {number} [n=4096]
 * @returns {string|null}  s 为 null/空 → null
 */
function truncate(s, n = 4096) {
  if (!s) return null;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/**
 * HTTP 响应统一校验 — 9 个 detector 里重复的 timeout/network/4xx/5xx 链.
 *
 * @param {object} r           httpClient.get/head 返回值
 * @param {string} detector    detector 类名 (this.constructor.name)
 * @param {string} note        通常是 URL
 * @param {{ includeRaw?: boolean, tooLargeNote?: string }} [opts]
 */
function assertHttpResponse(r, detector, note, opts = {}) {
  const includeRaw = opts.includeRaw !== false;
  if (r.error === "timeout") {
    throw new DetectorError({ detector, reason: REASONS.TIMEOUT, note });
  }
  if (r.error === "network") {
    throw new DetectorError({ detector, reason: REASONS.NETWORK, note });
  }
  if (r.error === "too_large") {
    throw new DetectorError({
      detector,
      reason: REASONS.TOO_LARGE,
      note: opts.tooLargeNote || "response body too large",
    });
  }
  if (r.status >= 400 && r.status < 500) {
    throw new DetectorError({
      detector,
      reason: REASONS.HTTP_4XX,
      httpStatus: r.status,
      ...(includeRaw ? { raw: truncate(r.body) } : {}),
      note,
    });
  }
  if (r.status >= 500) {
    throw new DetectorError({
      detector,
      reason: REASONS.HTTP_5XX,
      httpStatus: r.status,
      ...(includeRaw ? { raw: truncate(r.body) } : {}),
      note,
    });
  }
}

module.exports = {
  truncate,
  cleanVersion,
  assertHttpResponse,
};
