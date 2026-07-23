/**
 * src/main/notification-policy.ts
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
 * @param hhmm  "HH:MM" 24h
 * @returns  0-1439 (分钟数) or null if invalid
 */
export function parseHHMM(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 判断某个时间点是否在 quiet hours 窗口内
 * @param now
 * @param startHHMM  "23:00"
 * @param endHHMM    "08:00"  (允许跨午夜, 23:00→08:00 算 9 小时窗口)
 */
export function inQuietHours(now: Date, startHHMM: string, endHHMM: string): boolean {
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
 * @param results
 * @param state   整个 state object, 含 .apps map (caller 传 stateStore.load() 的结果)
 * @param cooldownMs
 * @param now     注入当前时间 (测试用), 默认 Date.now()
 * @returns 还在 cooldown 内、被抑制的 app names
 */
export function suppressedByCooldown(
  results: any[],
  state: any,
  cooldownMs: number,
  now?: number,
): string[] {
  if (!cooldownMs || cooldownMs <= 0) return [];
  const t = typeof now === "number" ? now : Date.now();
  const appsMap = (state && state.apps) || {};
  const out: string[] = [];
  for (const r of results) {
    if (!r || !r.has_update || !r.name) continue;
    const appEntry = appsMap[r.name];
    const last = appEntry && appEntry.last_notified;
    if (typeof last === "number" && t - last < cooldownMs) {
      out.push(r.name);
    }
  }
  return out;
}

module.exports = { parseHHMM, inQuietHours, suppressedByCooldown };