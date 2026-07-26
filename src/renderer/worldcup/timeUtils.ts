/**
 * src/renderer/worldcup/timeUtils.js
 *
 * v2.9.9 — 北京时间 utility
 *
 * openfootball TXT 格式: "13:00 UTC-6" 表示当地开赛时间 (非 UTC).
 * 转换: local → UTC (+offset) → 北京 (+8)
 *   例: 13:00 UTC-6 → UTC 19:00 → 北京次日 03:00
 */

// 2026-07-26: parseUtcOffset 改用 match-utils.ts 的 parseUtcOffsetHours (canonical,
//   两份实现字节相同 — main 端 match-key.ts 也有一份, 跨进程不能 require 故保留).
//   用 import 别名把 canonical 名字映射成本模块的 parseUtcOffset (保持现有 caller 不破坏).
import { parseUtcOffsetHours as parseUtcOffset } from "./match-utils.ts";
export { parseUtcOffset };

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function shiftDateYmd(date: any, dayShift: any) {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + dayShift);
  return {
    date: dt.toISOString().slice(0, 10),
    weekday: WEEKDAYS[dt.getUTCDay()],
  };
}

/**
 * 把 TXT 当地时间 + 时区 转换到北京时间
 * @param {string} time    "HH:MM" (当地)
 * @param {string} tz      "UTC-6" 等
 * @param {string} date    "YYYY-MM-DD" (赛程日, 当地日历日)
 * @returns {{ date: string, time: string, weekday: string, originalTime: string, originalDate: string }}
 */
export function toBeijingTime(time: any, tz: any, date: any) {
  const result = {
    date: date || "",
    time: time || "",
    originalTime: time ? `${time} ${tz || "UTC"}` : "",
    originalDate: date || "",
    weekday: "",
  };
  if (!time || !date) return result;

  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return result;

  const offsetH = parseUtcOffset(tz);
  let utcHour = h + offsetH;
  let dayShift = 0;
  while (utcHour >= 24) {
    utcHour -= 24;
    dayShift += 1;
  }
  while (utcHour < 0) {
    utcHour += 24;
    dayShift -= 1;
  }

  let bjHour = utcHour + 8;
  while (bjHour >= 24) {
    bjHour -= 24;
    dayShift += 1;
  }
  while (bjHour < 0) {
    bjHour += 24;
    dayShift -= 1;
  }

  result.time = `${String(bjHour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  if (dayShift !== 0) {
    const shifted = shiftDateYmd(date, dayShift);
    result.date = shifted.date;
    result.weekday = shifted.weekday;
  } else {
    const shifted = shiftDateYmd(date, 0);
    result.weekday = shifted.weekday;
  }

  return result;
}

export default { parseUtcOffset, toBeijingTime };
