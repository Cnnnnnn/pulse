/**
 * src/ai-usage/normalize.js
 *
 * Pure functions: raw API response → standardized snapshot.
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §3.2
 *
 * Schema notes (remains_percent endpoint, https://www.minimaxi.com/backend/account/token_plan/remains_percent):
 *   - model_remains[] 每块一个 model (general / video / voice / tts / ...)
 *   - 每块同时含 interval (5h) + weekly 两个窗口的字段
 *   - 百分比字段是字符串 "0%" / "64%" / "150%", 不是 number
 *   - total_percent > 100 表示周配额加成 (e.g. "150%" = 1.5x boost, 等价 weeklyBoostPermille=1500)
 *   - 旧 schema (/v1/token_plan/remains) 字段名 *_usage_count / *_remaining_percent 也兼容
 */

/**
 * 从 obj 取第一个存在的 key 的值, coerce 成 number.
 * 接受多候选 key 应对 schema drift.
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
 * 取 total 字段. 保留 0 (实际 API 常返 0 / -1 当 "未提供总额"), UI 自己判断 hasFraction.
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 * @returns {number|null}
 */
function _pickTotal(obj, keys) {
  return _pickNumber(obj, keys);
}

/**
 * 从 obj 取第一个存在的 key 的原始值 (任意类型).
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 * @returns {*}
 */
function _pickAny(obj, keys) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(keys) || keys.length === 0) {
    return undefined;
  }
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/**
 * 从 obj 取第一个存在的 key 的值, coerce 成 string.
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 * @returns {string|null}
 */
function _pickString(obj, keys) {
  const v = _pickAny(obj, keys);
  if (v === undefined) return null;
  return typeof v === 'string' ? v : String(v);
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
 * 解析百分比字段.
 * 接受: number (e.g. 99), string "99%" / "99" / " 99 % ".
 * 默认 clamp 到 0-100; allowOverflow=true 时允许 > 100 (e.g. "150%" 表示 1.5x 加成).
 * @param {*} v
 * @param {object} [opts] { allowOverflow?: boolean }
 * @returns {number|null}
 */
function _parsePercent(v, opts = {}) {
  if (v == null) return null;
  const allowOverflow = Boolean(opts && opts.allowOverflow);
  if (typeof v === 'number' && Number.isFinite(v)) {
    return allowOverflow ? Math.max(0, Math.round(v)) : Math.max(0, Math.min(100, Math.round(v)));
  }
  if (typeof v !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(v);
  if (!m) return null;
  return allowOverflow ? Math.max(0, Math.round(Number(m[1]))) : Math.max(0, Math.min(100, Math.round(Number(m[1]))));
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
function _buildWindow({ total, remaining, usedPercent, resetSec, label, fetchedAt, modelName, status, startTime, endTime, remainingPercent }) {
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
    remainingPercent: typeof remainingPercent === 'number' ? remainingPercent : null,
    resetAt,
    resetInSec: typeof resetSec === 'number' ? resetSec : null,
    label: label || '',
    modelName: modelName || null,
    status: typeof status === 'number' ? status : null,
    startTime: typeof startTime === 'number' ? startTime : null,
    endTime: typeof endTime === 'number' ? endTime : null,
  };
}

/**
 * 解析单块的单窗口字段.
 * 新 schema (remains_percent) 提供 used_percent / total_percent / used_count / remains_count.
 * 旧 schema (remains) 提供 usage_count / remaining_percent / total_count.
 * 两种 schema 共存的字段名 candidates 同时列出, 按优先级取.
 */
function _parseBlockWindow(block, opts) {
  const {
    totalKeys, remainingKeys, usedPctKeys, remainingPctKeys,
    resetKeys, statusKey, startKey, endKey,
  } = opts;

  const total = _pickTotal(block, totalKeys);
  const remaining = _pickNumber(block, remainingKeys);
  const usedPctFromApi = _parsePercent(_pickAny(block, usedPctKeys));
  const remainingPct = _parsePercent(_pickAny(block, remainingPctKeys));
  const usedPct = usedPctFromApi !== null
    ? usedPctFromApi
    : (remainingPct !== null ? Math.max(0, Math.min(100, 100 - remainingPct)) : null);
  const resetSec = _parseRemainsTime(
    _pickNumber(block, resetKeys.number || []) ?? _pickString(block, resetKeys.string || []),
  );
  const status = _pickNumber(block, [statusKey]);
  const startTime = _pickNumber(block, [startKey]);
  const endTime = _pickNumber(block, [endKey]);

  return { total, remaining, usedPct, remainingPct, resetSec, status, startTime, endTime };
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

  // 2) 取所有数据块
  const blocks = _pickBlocks(rawResponse);
  const snapshot = {
    provider: opts.provider || 'minimax',
    region: opts.region || 'cn',
    fetchedAt: typeof opts.fetchedAt === 'number' ? opts.fetchedAt : Date.now(),
    endpoint: typeof opts.endpoint === 'string' ? opts.endpoint : null,
    windows: {},
    credits: null,
    weeklyBoostPermille: null,
    baseResp: baseResp && typeof baseResp === 'object' ? { ...baseResp } : null,
    _rawBlocks: blocks,
  };

  if (blocks.length === 0) {
    return { ok: true, snapshot };
  }

  // 3) 找 general (5h + 周) 和 video (视频赠送) 块
  //    老 schema 没 model_name, 默认当 general 处理
  const general = blocks.find((b) => b.model_name === 'general')
    || blocks.find((b) => !b.model_name)
    || blocks[0];
  const video = blocks.find((b) => b.model_name === 'video');

  // 4) general 块的 5h 窗口
  if (general) {
    const parsed = _parseBlockWindow(general, {
      totalKeys: ['current_interval_total_count', 'current_interval_remains_count'],
      remainingKeys: ['current_interval_remains_count', 'current_interval_usage_count'],
      usedPctKeys: ['current_interval_used_percent'],
      remainingPctKeys: ['current_interval_remaining_percent'],
      resetKeys: { number: ['remains_time'], string: ['interval_remains_time'] },
      statusKey: 'current_interval_status',
      startKey: 'start_time',
      endKey: 'end_time',
    });
    const { total, remaining, usedPct, remainingPct, resetSec, status, startTime, endTime } = parsed;
    if (total !== null || remaining !== null || usedPct !== null || resetSec !== null) {
      snapshot.windows['5h'] = _buildWindow({
        total, remaining, usedPercent: usedPct, remainingPercent: remainingPct,
        resetSec, label: '5 小时滚动窗口', fetchedAt: snapshot.fetchedAt,
        modelName: 'general', status, startTime, endTime,
      });
    } else {
      snapshot.windows['5h'] = null;
    }

    // 5) general 块的周窗口
    const wParsed = _parseBlockWindow(general, {
      totalKeys: ['current_weekly_total_count', 'current_weekly_remains_count'],
      remainingKeys: ['current_weekly_remains_count', 'current_weekly_usage_count'],
      usedPctKeys: ['current_weekly_used_percent'],
      remainingPctKeys: ['current_weekly_remaining_percent'],
      resetKeys: { number: ['weekly_remains_time'], string: ['weekly_remains_time'] },
      statusKey: 'current_weekly_status',
      startKey: 'weekly_start_time',
      endKey: 'weekly_end_time',
    });
    const { total: wTotal, remaining: wRemaining, usedPct: wUsedPct, remainingPct: wRemainingPct,
            resetSec: wResetSec, status: wStatus, startTime: wStart, endTime: wEnd } = wParsed;

    // 周配额加成 (千分比: 1000=1.0x 基线, 1500=1.5x 加成, 500=0.5x 减半).
    // 新 schema 字段 weekly_boost_permille 缺失, 但 current_weekly_total_percent > 100 表示加成:
    //   "150%" → weeklyBoostPermille = 1500.
    const totalPct = _parsePercent(_pickAny(general, ['current_weekly_total_percent']), { allowOverflow: true });
    snapshot.weeklyBoostPermille = _pickNumber(general, ['weekly_boost_permille'])
      ?? (totalPct !== null ? totalPct * 10 : null);

    if (wTotal !== null || wRemaining !== null || wUsedPct !== null || wResetSec !== null) {
      snapshot.windows.weekly = _buildWindow({
        total: wTotal, remaining: wRemaining, usedPercent: wUsedPct, remainingPercent: wRemainingPct,
        resetSec: wResetSec, label: '周窗口', fetchedAt: snapshot.fetchedAt,
        modelName: 'general', status: wStatus, startTime: wStart, endTime: wEnd,
      });
    } else {
      snapshot.windows.weekly = null;
    }
  }

  // 6) video 块 (视频赠送) — interval + weekly 两个窗口
  if (video) {
    const iParsed = _parseBlockWindow(video, {
      totalKeys: ['current_interval_total_count', 'current_interval_remains_count'],
      remainingKeys: ['current_interval_remains_count', 'current_interval_usage_count'],
      usedPctKeys: ['current_interval_used_percent'],
      remainingPctKeys: ['current_interval_remaining_percent'],
      resetKeys: { number: ['remains_time'], string: ['interval_remains_time'] },
      statusKey: 'current_interval_status',
      startKey: 'start_time',
      endKey: 'end_time',
    });
    const { total: vTotal, remaining: vRemaining, usedPct: vUsedPct, remainingPct: vRemainingPct,
            resetSec: vResetSec, status: vStatus, startTime: vStart, endTime: vEnd } = iParsed;
    if (vTotal !== null || vRemaining !== null || vUsedPct !== null || vResetSec !== null) {
      snapshot.windows.video = _buildWindow({
        total: vTotal, remaining: vRemaining, usedPercent: vUsedPct, remainingPercent: vRemainingPct,
        resetSec: vResetSec, label: '视频赠送', fetchedAt: snapshot.fetchedAt,
        modelName: 'video', status: vStatus, startTime: vStart, endTime: vEnd,
      });
    } else {
      snapshot.windows.video = null;
    }

    // 6b) video 块的周窗口
    const vwParsed = _parseBlockWindow(video, {
      totalKeys: ['current_weekly_total_count', 'current_weekly_remains_count'],
      remainingKeys: ['current_weekly_remains_count', 'current_weekly_usage_count'],
      usedPctKeys: ['current_weekly_used_percent'],
      remainingPctKeys: ['current_weekly_remaining_percent'],
      resetKeys: { number: ['weekly_remains_time'], string: ['weekly_remains_time'] },
      statusKey: 'current_weekly_status',
      startKey: 'weekly_start_time',
      endKey: 'weekly_end_time',
    });
    const { total: vwTotal, remaining: vwRemaining, usedPct: vwUsedPct, remainingPct: vwRemainingPct,
            resetSec: vwResetSec, status: vwStatus, startTime: vwStart, endTime: vwEnd } = vwParsed;
    if (vwTotal !== null || vwRemaining !== null || vwUsedPct !== null || vwResetSec !== null) {
      snapshot.windows.videoWeekly = _buildWindow({
        total: vwTotal, remaining: vwRemaining, usedPercent: vwUsedPct, remainingPercent: vwRemainingPct,
        resetSec: vwResetSec, label: '视频周额度', fetchedAt: snapshot.fetchedAt,
        modelName: 'video', status: vwStatus, startTime: vwStart, endTime: vwEnd,
      });
    } else {
      snapshot.windows.videoWeekly = null;
    }
  }

  return { ok: true, snapshot };
}

module.exports = {
  _pickNumber,
  _pickTotal,
  _pickAny,
  _pickString,
  _parseRemainsTime,
  _parsePercent,
  _pickBlocks,
  _buildWindow,
  normalize,
};