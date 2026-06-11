/**
 * src/renderer/worldcup/timeUtils.js
 *
 * v2.9.3 — 北京时间 utility
 *
 * TXT 给的 "13:00 UTC-6" 这种, 转换到 北京时间 (UTC+8):
 *   utc_total = utc + (-offset)   e.g. UTC-6 → 减去 6 小时
 *   beijing   = utc_total + 8     e.g. (13:00 + 6) + 8 = 03:00+1d
 *
 * 跨日处理: date 也调整 (UTC+8 可能 +1 天)
 */

/**
 * @param {string} tz   e.g. "UTC-6" / "UTC+5" / ""
 * @returns {number}    小时 offset (跟 JS Date.getTimezoneOffset() 反向, 正数=东)
 *                      e.g. "UTC-6" → 6, "UTC+5" → -5
 */
export function parseUtcOffset(tz) {
  if (!tz || typeof tz !== 'string') return 0;
  const m = tz.match(/^UTC([+\-])(\d{1,2})$/);
  if (!m) return 0;
  const sign = m[1] === '+' ? -1 : 1;  // JS Date.getTimezoneOffset 反向
  const hours = parseInt(m[2], 10);
  return sign * hours;
}

/**
 * 把 UTC 时间 + tz_offset 转换到 北京时间
 * @param {string} time    "HH:MM"
 * @param {string} tz      "UTC-6" 等
 * @param {string} date    "YYYY-MM-DD" (本地, TXT 给的)
 * @returns {{ date: string, time: string, weekday: string, originalTime: string }}
 *          originalTime 保留 原 UTC 时间, display 用 date + time
 */
export function toBeijingTime(time, tz, date) {
  const result = {
    date: date || '',
    time: time || '',
    originalTime: time ? `${time} ${tz || 'UTC'}` : '',
    originalDate: date || '',
    weekday: '',
  };
  if (!time || !date) return result;

  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return result;

  // 计算 UTC 时刻 (毫秒)
  const offsetHours = parseUtcOffset(tz);
  // beijing = utc - offset + 8
  let bjHour = h - offsetHours + 8;
  let dayShift = 0;
  while (bjHour >= 24) { bjHour -= 24; dayShift += 1; }
  while (bjHour < 0) { bjHour += 24; dayShift -= 1; }

  result.time = `${String(bjHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // 调整 date
  if (dayShift !== 0) {
    const dt = new Date(`${date}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + dayShift);
    result.date = dt.toISOString().slice(0, 10);
    result.weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getUTCDay()];
  } else {
    const dt = new Date(`${date}T00:00:00Z`);
    result.weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getUTCDay()];
  }

  return result;
}

export default { parseUtcOffset, toBeijingTime };
