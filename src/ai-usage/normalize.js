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

/**
 * 取数据块. 优先 model_remains[0], fallback coding_plan_remains[0].
 * @param {object} raw
 * @returns {object|null}
 */
function _pickBlock(raw) {
  const m = Array.isArray(raw.model_remains) && raw.model_remains.length > 0 ? raw.model_remains[0] : null;
  if (m && typeof m === 'object') return m;
  const c = Array.isArray(raw.coding_plan_remains) && raw.coding_plan_remains.length > 0 ? raw.coding_plan_remains[0] : null;
  if (c && typeof c === 'object') return c;
  return null;
}

/**
 * 组装单个窗口数据. 任一字段缺 → 返 null.
 * @param {object} opts
 * @returns {object|null}
 */
function _buildWindow({ total, remaining, resetSec, label, fetchedAt }) {
  if (total === null && remaining === null && resetSec === null) return null;
  const used = (typeof total === 'number' && typeof remaining === 'number')
    ? Math.max(0, total - remaining) : null;
  const resetAt = (typeof resetSec === 'number' && typeof fetchedAt === 'number')
    ? fetchedAt + resetSec * 1000 : null;
  return {
    total: typeof total === 'number' ? total : null,
    remaining: typeof remaining === 'number' ? remaining : null,
    used,
    resetAt,
    resetInSec: typeof resetSec === 'number' ? resetSec : null,
    label: label || '',
  };
}

/**
 * 主入口: 解析 raw API response → 标准化 snapshot.
 * @param {object|null} rawResponse
 * @param {object} [opts] { fetchedAt, endpoint, provider, region }
 * @returns {{ok: boolean, snapshot?: object, reason?: string, error?: string}}
 */
function normalize(rawResponse, opts = {}) {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return { ok: false, reason: 'api_error', error: 'response_not_object' };
  }

  // 1) base_resp 校验
  const baseResp = rawResponse.base_resp;
  if (baseResp && typeof baseResp === 'object' && typeof baseResp.status_code === 'number'
      && baseResp.status_code !== 0) {
    return { ok: false, reason: 'api_error', error: baseResp.status_msg || 'unknown' };
  }

  // 2) 取数据块 (兼容老 schema)
  const block = _pickBlock(rawResponse);
  const snapshot = {
    provider: opts.provider || 'minimax',
    region: opts.region || 'cn',
    fetchedAt: typeof opts.fetchedAt === 'number' ? opts.fetchedAt : Date.now(),
    endpoint: typeof opts.endpoint === 'string' ? opts.endpoint : null,
    windows: {},
    credits: null,
  };

  if (!block) {
    return { ok: true, snapshot };
  }

  // 3) 5h 窗口
  const intervalTotal = _pickNumber(block, ['current_interval_total_count']);
  const intervalRemaining = _pickNumber(block, ['current_interval_usage_count']);
  const intervalResetSec = _parseDdHhMmSs(_pickString(block, ['interval_remains_time']));
  if (intervalTotal !== null || intervalRemaining !== null || intervalResetSec !== null) {
    snapshot.windows['5h'] = _buildWindow({
      total: intervalTotal,
      remaining: intervalRemaining,
      resetSec: intervalResetSec,
      label: '5 小时滚动窗口',
      fetchedAt: snapshot.fetchedAt,
    });
  } else {
    snapshot.windows['5h'] = null;
  }

  // 4) 周窗口
  const weeklyTotal = _pickNumber(block, ['current_weekly_total_count']);
  const weeklyRemaining = _pickNumber(block, ['current_weekly_usage_count']);
  const weeklyResetSec = _parseDdHhMmSs(_pickString(block, ['weekly_remains_time']));
  if (weeklyTotal !== null || weeklyRemaining !== null || weeklyResetSec !== null) {
    snapshot.windows.weekly = _buildWindow({
      total: weeklyTotal,
      remaining: weeklyRemaining,
      resetSec: weeklyResetSec,
      label: '周窗口',
      fetchedAt: snapshot.fetchedAt,
    });
  } else {
    snapshot.windows.weekly = null;
  }

  return { ok: true, snapshot };
}

module.exports = {
  _pickNumber,
  _pickString,
  _parseDdHhMmSs,
  _pickBlock,
  _buildWindow,
  normalize,
};
