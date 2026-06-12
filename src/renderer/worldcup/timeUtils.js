/**
 * src/renderer/worldcup/timeUtils.js
 *
 * v2.9.9 — 北京时间 utility
 *
 * openfootball TXT 格式: "13:00 UTC-6" 表示当地开赛时间 (非 UTC).
 * 转换: local → UTC (+offset) → 北京 (+8)
 *   例: 13:00 UTC-6 → UTC 19:00 → 北京次日 03:00
 */

/**
 * 当地时区相对 UTC 的小时偏移量 (加到当地时间得到 UTC 小时).
 * 与 match-utils.js / match-key.js 的 parseUtcOffsetHours 一致.
 * @param {string} tz  e.g. "UTC-6" / "UTC+5"
 * @returns {number}   UTC-6 → 6, UTC+5 → -5
 */
export function parseUtcOffset(tz) {
  if (!tz || typeof tz !== "string") return 0;
  const m = tz.match(/^UTC([+\-])(\d{1,2})$/);
  if (!m) return 0;
  return m[1] === "+" ? -parseInt(m[2], 10) : parseInt(m[2], 10);
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function shiftDateYmd(date, dayShift) {
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
export function toBeijingTime(time, tz, date) {
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
