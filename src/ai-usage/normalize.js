/**
 * src/ai-usage/normalize.js
 *
 * Pure functions: raw API response → standardized snapshot.
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §3.2
 */

/**
 * 从 obj 取第一个存在的 key 的值, coerce 成 number.
 * 接受多候选 key 应对 schema drift (issue #99 教训).
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 * @returns {number|null}
 */
function _pickNumber(obj, keys) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(keys) || keys.length === 0) {
    return null;
  }
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * 从 obj 取第一个存在的 key 的值, coerce 成 string.
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 * @returns {string|null}
 */
function _pickString(obj, keys) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(keys) || keys.length === 0) {
    return null;
  }
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    return typeof v === 'string' ? v : String(v);
  }
  return null;
}

/**
 * 解析 DD:HH:MM:SS 格式 (minimax reset countdown) → 总秒数.
 * @param {string|null|undefined} s
 * @returns {number|null}
 */
function _parseDdHhMmSs(s) {
  if (typeof s !== 'string' || s.length === 0) return null;
  const m = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, d, h, m1, sec] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(m1) * 60 + Number(sec);
}

module.exports = { _pickNumber, _pickString, _parseDdHhMmSs };
