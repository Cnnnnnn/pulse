/**
 * src/main/ithome/date-bounds.js
 *
 * 仅允许拉取「当前自然月」内、且不晚于今天的日期 (Asia/Shanghai)
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayShanghaiDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(now);
}

function currentMonthPrefix(now = new Date()) {
  return todayShanghaiDateKey(now).slice(0, 7);
}

function isValidDateKey(dateKey) {
  return typeof dateKey === "string" && DATE_RE.test(dateKey);
}

function isInCurrentMonth(dateKey, now = new Date()) {
  if (!isValidDateKey(dateKey)) return false;
  return dateKey.slice(0, 7) === currentMonthPrefix(now);
}

function isFetchableDate(dateKey, now = new Date()) {
  if (!isInCurrentMonth(dateKey, now)) return false;
  return dateKey <= todayShanghaiDateKey(now);
}

function monthDayRange(now = new Date()) {
  const today = todayShanghaiDateKey(now);
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefix = `${y}-${String(m).padStart(2, "0")}`;
  const days = [];
  for (let d = 1; d <= lastDay; d += 1) {
    const key = `${prefix}-${String(d).padStart(2, "0")}`;
    if (key <= today) days.push(key);
  }
  return {
    today,
    prefix,
    days,
    firstDay: days[0],
    lastDay: days[days.length - 1],
  };
}

function assertFetchableDate(dateKey, now = new Date()) {
  if (!isValidDateKey(dateKey)) {
    const err = new Error("invalid_date");
    err.code = "invalid_date";
    throw err;
  }
  if (!isInCurrentMonth(dateKey, now)) {
    const err = new Error("not_current_month");
    err.code = "not_current_month";
    throw err;
  }
  if (dateKey > todayShanghaiDateKey(now)) {
    const err = new Error("future_date");
    err.code = "future_date";
    throw err;
  }
}

function listPageUrl(dateKey) {
  return `https://www.ithome.com/list/${dateKey}.html`;
}

module.exports = {
  DATE_RE,
  todayShanghaiDateKey,
  currentMonthPrefix,
  isValidDateKey,
  isInCurrentMonth,
  isFetchableDate,
  monthDayRange,
  assertFetchableDate,
  listPageUrl,
};
