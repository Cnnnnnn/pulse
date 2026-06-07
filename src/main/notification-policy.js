/**
 * src/main/notification-policy.js
 *
 * Phase 17: 通知抑制策略. 解决两个骚扰场景:
 *
 *   1. **Quiet hours** (e.g. 23:00-08:00): 睡眠时段不发通知
 *   2. **Cooldown** (e.g. 24h): 同一批 app 在 cooldown 窗口内只发一次
 *
 * 数据流:
 *   - 配置: getConfig().notifications = { quiet_hours_start, quiet_hours_end, cooldown_hours }
 *   - 状态: apps[name].last_notified (epoch ms) 存到 state.json
 *
 * 用法:
 *   const { shouldNotify, markNotified } = createPolicy({ getConfig, getState, setLastNotified })
 *   if (shouldNotify(results)) markNotified(results)
 */

/**
 * @param {string} hhmm  "HH:MM" 24h
 * @returns {number}    0-1439 (分钟数)
 */
function parseHHMM(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 判断某个时间点是否在 quiet hours 窗口内
 * @param {Date}   now
 * @param {string} startHHMM  "23:00"
 * @param {string} endHHMM    "08:00"  (允许跨午夜, 23:00→08:00 算 9 小时窗口)
 * @returns {boolean}
 */
function inQuietHours(now, startHHMM, endHHMM) {
  const start = parseHHMM(startHHMM);
  const end = parseHHMM(endHHMM);
  if (start === null || end === null) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false; // 0-length window = 不限制
  if (start < end) {
    // 同日内: e.g. 09:00-17:00
    return nowMin >= start && nowMin < end;
  } else {
    // 跨午夜: e.g. 23:00-08:00
    return nowMin >= start || nowMin < end;
  }
}

/**
 * @param {Array<{name: string, has_update: boolean}>} results
 * @param {object} state   整个 state object, 含 .apps map (caller 传 stateStore.load() 的结果)
 * @param {number} cooldownMs
 * @param {number} [now]   注入当前时间 (测试用), 默认 Date.now()
 * @returns {Array<string>} 还在 cooldown 内、被抑制的 app names
 */
function suppressedByCooldown(results, state, cooldownMs, now) {
  if (!cooldownMs || cooldownMs <= 0) return [];
  const t = (typeof now === 'number') ? now : Date.now();
  const appsMap = (state && state.apps) || {};
  const out = [];
  for (const r of results) {
    if (!r || !r.has_update || !r.name) continue;
    const appEntry = appsMap[r.name];
    const last = appEntry && appEntry.last_notified;
    if (typeof last === 'number' && (t - last) < cooldownMs) {
      out.push(r.name);
    }
  }
  return out;
}

module.exports = {
  parseHHMM,
  inQuietHours,
  suppressedByCooldown,
};
