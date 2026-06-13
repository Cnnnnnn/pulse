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

module.exports = {
  truncate,
  cleanVersion,
};
