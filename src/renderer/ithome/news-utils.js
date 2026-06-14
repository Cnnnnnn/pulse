/**
 * src/renderer/ithome/news-utils.js
 */

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function todayShanghaiDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(now);
}

export function currentMonthLabel(now = new Date()) {
  const today = todayShanghaiDateKey(now);
  const [y, m] = today.split("-");
  return `${y}年${Number(m)}月`;
}

export function monthDayRange(now = new Date()) {
  const today = todayShanghaiDateKey(now);
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefix = `${y}-${String(m).padStart(2, "0")}`;
  const days = [];
  for (let d = 1; d <= lastDay; d += 1) {
    const key = `${prefix}-${String(d).padStart(2, "0")}`;
    if (key <= today) days.push(key);
  }
  return { today, days, firstDay: days[0], lastDay: days[days.length - 1] };
}

export function shiftDateKey(dateKey, delta, now = new Date()) {
  const { days } = monthDayRange(now);
  const idx = days.indexOf(dateKey);
  if (idx < 0) return dateKey;
  const next = days[idx + delta];
  return next || dateKey;
}

export function canGoPrevDay(dateKey, now = new Date()) {
  const { days } = monthDayRange(now);
  return days.indexOf(dateKey) > 0;
}

export function canGoNextDay(dateKey, now = new Date()) {
  const { days } = monthDayRange(now);
  const idx = days.indexOf(dateKey);
  return idx >= 0 && idx < days.length - 1;
}

export function sidebarDayCount(dayStats, articles, dateKey) {
  const stat = dayStats && dayStats[dateKey];
  if (stat && typeof stat.count === "number" && stat.count > 0) {
    return stat.count;
  }
  return articlesForDate(articles, dateKey).length;
}

export function articlesForDate(articles, dateKey) {
  const list = Object.values(articles || {}).filter(
    (a) => a && a.dateKey === dateKey,
  );
  list.sort((a, b) => {
    const ta = Date.parse(a.pubDate || "") || 0;
    const tb = Date.parse(b.pubDate || "") || 0;
    return tb - ta;
  });
  return list;
}

export function formatDayHeader(dateKey) {
  if (!dateKey) return "";
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  const wd = WEEKDAYS[d.getDay()];
  return `${dateKey} ${wd}`;
}

export function formatFeedDate(dateKey) {
  if (!dateKey) return "";
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  const [, m, day] = dateKey.split("-");
  return `${Number(m)}月${Number(day)}日 · ${WEEKDAYS[d.getDay()]}`;
}

export function formatArticleTime(pubDate) {
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function favoriteDateKeys(favorites) {
  const set = new Set();
  for (const fav of Object.values(favorites || {})) {
    if (fav && fav.article && fav.article.dateKey) {
      set.add(fav.article.dateKey);
    }
  }
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function favoritesForDate(favorites, dateKey) {
  const list = Object.values(favorites || {})
    .filter((f) => f && f.article && f.article.dateKey === dateKey)
    .map((f) => f.article);
  list.sort((a, b) => {
    const ta = Date.parse(a.pubDate || "") || 0;
    const tb = Date.parse(b.pubDate || "") || 0;
    return tb - ta;
  });
  return list;
}

export function canGoPrevFavoriteDay(dateKey, favorites) {
  const days = favoriteDateKeys(favorites);
  return days.indexOf(dateKey) > 0;
}

export function canGoNextFavoriteDay(dateKey, favorites) {
  const days = favoriteDateKeys(favorites);
  const idx = days.indexOf(dateKey);
  return idx >= 0 && idx < days.length - 1;
}

export function shiftFavoriteDateKey(dateKey, delta, favorites) {
  const days = favoriteDateKeys(favorites);
  const idx = days.indexOf(dateKey);
  if (idx < 0) return dateKey;
  const next = days[idx + delta];
  return next || dateKey;
}

export function favoriteCount(favorites) {
  return Object.keys(favorites || {}).length;
}

export function isTodayDateKey(dateKey, now = new Date()) {
  return dateKey === todayShanghaiDateKey(now);
}

export function formatDateChip(dateKey) {
  if (!dateKey) return "";
  const parts = dateKey.split("-");
  if (parts.length < 3) return dateKey;
  return `${Number(parts[2])}日`;
}

export function weekdayShort(dateKey) {
  if (!dateKey) return "";
  const d = new Date(`${dateKey}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getDay()].replace("周", "");
}

export function formatExcerptPreview(text, maxLen = 96) {
  const raw = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}…`;
}

export function countSummarizedArticles(articles, summaries) {
  return (articles || []).filter((a) => a && summaries && summaries[a.id]?.text)
    .length;
}

export function readCountForDate(articles, readIds, dateKey) {
  if (!articles || !readIds) return 0;
  let n = 0;
  for (const a of Object.values(articles)) {
    if (a && a.dateKey === dateKey && readIds[a.id]) n += 1;
  }
  return n;
}
