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
 * 解析 reset countdown 字段 → 剩余秒数.
 * 真 API 返 number (毫秒, 值大), 旧 schema 返 string (DD:HH:MM:SS).
 * @param {string|number|null|undefined} v
 * @returns {number|null}
 */
function _parseRemainsTime(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    // 毫秒 → 秒 (值 ≥ 10000 当 ms 看待; 1 周=604800s, ms=604800000 远大于 10000)
    // 真正秒数最大值远小于 1e7, 数字 >= 10000 一律当 ms
    if (v >= 10000) return Math.round(v / 1000);
    return v;
  }
  if (typeof v !== 'string' || v.length === 0) return null;
  const asNum = Number(v);
  if (Number.isFinite(asNum) && asNum >= 0 && /^\d+$/.test(v)) {
    if (asNum >= 10000) return Math.round(asNum / 1000);
    return asNum;
  }
  const m = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/.exec(v);
  if (m) return Number(m[1]) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
  return null;
}

/**
 * 取所有 model_remains 块 (新版 schema 一个 model 一块, 兼容老 schema 单块).
 * @param {object} raw
 * @returns {object[]}
 */
function _pickBlocks(raw) {
  if (Array.isArray(raw.model_remains) && raw.model_remains.length > 0) {
    return raw.model_remains.filter((b) => b && typeof b === 'object');
  }
  if (Array.isArray(raw.coding_plan_remains) && raw.coding_plan_remains.length > 0) {
    return raw.coding_plan_remains.filter((b) => b && typeof b === 'object');
  }
  return [];
}

/**
 * 组装单个窗口数据. 优先用 percent 字段, fallback 算 used = total - remaining.
 * @param {object} opts
 * @returns {object|null}
 */
function _buildWindow({ total, remaining, usedPercent, resetSec, label, fetchedAt, modelName, status, startTime, endTime }) {
  if (total === null && remaining === null && usedPercent === null && resetSec === null) return null;
  const used = (typeof total === 'number' && typeof remaining === 'number')
    ? Math.max(0, total - remaining) : null;
  const usedPct = typeof usedPercent === 'number' ? usedPercent
    : (typeof used === 'number' && typeof total === 'number' && total > 0
        ? Math.min(100, Math.round((used / total) * 100))
        : null);
  const resetAt = (typeof resetSec === 'number' && typeof fetchedAt === 'number')
    ? fetchedAt + resetSec * 1000 : null;
  return {
    total: typeof total === 'number' ? total : null,
    remaining: typeof remaining === 'number' ? remaining : null,
    used,
    usedPercent: usedPct,
    resetAt,
    resetInSec: typeof resetSec === 'number' ? resetSec : null,
    label: label || '',
    modelName: modelName || null,
    // 状态: 1=正常, 0=限流. UI 渲染徽章.
    status: typeof status === 'number' ? status : null,
    // 窗口起止 epoch ms. UI 渲染 "HH:mm 重置"
    startTime: typeof startTime === 'number' ? startTime : null,
    endTime: typeof endTime === 'number' ? endTime : null,
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

  // 2) 取所有数据块 (新版 schema 一个 model 一块, 兼容老 schema 单块)
  const blocks = _pickBlocks(rawResponse);
  const snapshot = {
    provider: opts.provider || 'minimax',
    region: opts.region || 'cn',
    fetchedAt: typeof opts.fetchedAt === 'number' ? opts.fetchedAt : Date.now(),
    endpoint: typeof opts.endpoint === 'string' ? opts.endpoint : null,
    windows: {},
    credits: null,
    // 调试: 把 block 原始数据带进 snapshot, UI 暂不展示. 方便后续排查 schema drift.
    _rawBlocks: blocks,
  };

  if (blocks.length === 0) {
    return { ok: true, snapshot };
  }

  // 3) 找 general (5h + 周) 和 video (视频赠送) 块
  //    老 schema 没 model_name, 默认当 general 处理 (只一块)
  const general = blocks.find((b) => b.model_name === 'general')
    || blocks.find((b) => !b.model_name)
    || blocks[0];
  const video = blocks.find((b) => b.model_name === 'video');

  // 4) general 块的 5h 窗口
  if (general) {
    const intervalTotal = _pickNumber(general, ['current_interval_total_count']);
    const intervalRemaining = _pickNumber(general, ['current_interval_usage_count']);
    const intervalUsedPct = (() => {
      const pct = _pickNumber(general, ['current_interval_remaining_percent']);
      if (pct === null) return null;
      return Math.max(0, Math.min(100, 100 - pct));
    })();
    const intervalResetSec = _parseRemainsTime(
      _pickNumber(general, ['remains_time']) ?? _pickString(general, ['interval_remains_time']),
    );
    const intervalStatus = _pickNumber(general, ['current_interval_status']);
    if (intervalTotal !== null || intervalRemaining !== null || intervalUsedPct !== null || intervalResetSec !== null) {
      snapshot.windows['5h'] = _buildWindow({
        total: intervalTotal,
        remaining: intervalRemaining,
        usedPercent: intervalUsedPct,
        resetSec: intervalResetSec,
        label: '5 小时滚动窗口',
        fetchedAt: snapshot.fetchedAt,
        modelName: 'general',
        status: intervalStatus,
        startTime: _pickNumber(general, ['start_time']),
        endTime: _pickNumber(general, ['end_time']),
      });
    } else {
      snapshot.windows['5h'] = null;
    }

    // 5) general 块的周窗口
    const weeklyTotal = _pickNumber(general, ['current_weekly_total_count']);
    const weeklyRemaining = _pickNumber(general, ['current_weekly_usage_count']);
    const weeklyUsedPct = (() => {
      const pct = _pickNumber(general, ['current_weekly_remaining_percent']);
      if (pct === null) return null;
      return Math.max(0, Math.min(100, 100 - pct));
    })();
    const weeklyResetSec = _parseRemainsTime(
      _pickNumber(general, ['weekly_remains_time']) ?? _pickString(general, ['weekly_remains_time']),
    );
    const weeklyStatus = _pickNumber(general, ['current_weekly_status']);
    if (weeklyTotal !== null || weeklyRemaining !== null || weeklyUsedPct !== null || weeklyResetSec !== null) {
      snapshot.windows.weekly = _buildWindow({
        total: weeklyTotal,
        remaining: weeklyRemaining,
        usedPercent: weeklyUsedPct,
        resetSec: weeklyResetSec,
        label: '周窗口',
        fetchedAt: snapshot.fetchedAt,
        modelName: 'general',
        status: weeklyStatus,
        startTime: _pickNumber(general, ['weekly_start_time']),
        endTime: _pickNumber(general, ['weekly_end_time']),
      });
    } else {
      snapshot.windows.weekly = null;
    }
  } // ← 关闭 `if (general) { ... }`

  // 6) video 块 (视频赠送) — 用 interval 字段当视频配额窗口
  if (video) {
    const vTotal = _pickNumber(video, ['current_interval_total_count']);
    const vRemaining = _pickNumber(video, ['current_interval_usage_count']);
    const vUsedPct = (() => {
      const pct = _pickNumber(video, ['current_interval_remaining_percent']);
      if (pct === null) return null;
      return Math.max(0, Math.min(100, 100 - pct));
    })();
    const vResetSec = _parseRemainsTime(
      _pickNumber(video, ['remains_time']) ?? _pickString(video, ['interval_remains_time']),
    );
    if (vTotal !== null || vRemaining !== null || vUsedPct !== null || vResetSec !== null) {
      snapshot.windows.video = _buildWindow({
        total: vTotal,
        remaining: vRemaining,
        usedPercent: vUsedPct,
        resetSec: vResetSec,
        label: '视频赠送',
        fetchedAt: snapshot.fetchedAt,
        modelName: 'video',
        status: _pickNumber(video, ['current_interval_status']),
        startTime: _pickNumber(video, ['start_time']),
        endTime: _pickNumber(video, ['end_time']),
      });
    } else {
      snapshot.windows.video = null;
    }
  }

  return { ok: true, snapshot };
}

module.exports = {
  _pickNumber,
  _pickString,
  _parseRemainsTime,
  _pickBlocks,
  _buildWindow,
  normalize,
};
