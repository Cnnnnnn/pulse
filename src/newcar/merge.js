/**
 * src/newcar/merge.js
 *
 * 远程优先覆盖合并纯函数 (ESM, 可单测).
 *
 * 由渲染层 newcar-store 与单测调用. 主进程不引用本模块 (CJS/ESM 红线).
 *
 * 轻量校验: 仅保留 id 为合法非空字符串且 releaseDate 为"格式 + 日历有效"的记录,
 * 与 src/newcar/dataset.js 的 normalize / 主进程内联 normalizeReleases 同口径
 * (含真实日期校验, 2026-13-01 这类月=13 的非法日历会被丢弃),
 * 确保即使未经上游清洗的数据流入也不会污染合并结果.
 */

/**
 * releaseDate 是否合法: 格式 YYYY-MM-DD 且为真实日历日期.
 * @param {*} s
 * @returns {boolean}
 */
function isValidReleaseDate(s) {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/**
 * 单条记录是否可作为合并的合法单元.
 * @param {*} rec
 * @returns {boolean}
 */
function isValidRecord(rec) {
  return (
    rec &&
    typeof rec.id === "string" &&
    rec.id !== "" &&
    isValidReleaseDate(rec.releaseDate)
  );
}

/**
 * 远程优先覆盖合并.
 *
 * 规则:
 *   - 远程有 id → 覆盖本地同 id (远程优先)
 *   - 远程独有 id → 补入
 *   - 本地 builtin 独有 id → 保留
 *   - 无合法 id / releaseDate 格式非法的记录 → 丢弃 (不污染)
 *
 * 纯函数、幂等: mergeByRemoteFirst(baseline, remote) 多次调用结果稳定.
 * remote 为空数组时返回本地原样 (长度不变).
 *
 * @param {Array} local  基线 (builtinBaseline, 已 normalize)
 * @param {Array} remote 远程 (已 normalize)
 * @returns {Array} 合并后数组
 */
export function mergeByRemoteFirst(local, remote) {
  const base = Array.isArray(local) ? local : [];
  const incoming = Array.isArray(remote) ? remote : [];
  const map = new Map();

  // 先灌本地, 保持本地顺序与基线稳定
  for (const rec of base) {
    if (isValidRecord(rec)) map.set(rec.id, rec);
  }
  // 再灌远程: 同 id 覆盖 (远程优先), 独有补入 (追加到末尾)
  for (const rec of incoming) {
    if (isValidRecord(rec)) map.set(rec.id, rec);
  }

  return [...map.values()];
}
