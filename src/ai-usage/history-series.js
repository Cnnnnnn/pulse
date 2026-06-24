/**
 * src/ai-usage/history-series.js
 *
 * 7 天用量序列构建 — main / renderer 共用.
 */

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(yyyyMmDd, deltaDays) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function buildAllEmpty(n) {
  const series = [];
  for (let i = n - 1; i >= 0; i--) {
    series.push({ date: addDays(todayKey(), -i), percent: 0, used: null });
  }
  return { series };
}

/**
 * @param {Array<{date:string, percent:number, used?:number|null}>} rawDays
 * @param {number} n
 */
function buildSeries(rawDays, n) {
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    return buildAllEmpty(n);
  }
  const map = new Map();
  for (const d of rawDays) {
    if (
      !d ||
      typeof d.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d.date)
    ) {
      continue;
    }
    const prev = map.get(d.date);
    const percent = typeof d.percent === "number" ? d.percent : 0;
    const used = typeof d.used === "number" ? d.used : null;
    if (!prev || percent > prev.percent) {
      map.set(d.date, {
        date: d.date,
        percent,
        used: prev && used == null ? prev.used : used,
      });
    } else if (prev.used == null && used != null) {
      prev.used = used;
    }
  }
  const sorted = [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  let series = sorted.slice(-n);
  const today = todayKey();
  const lastDate = series.length > 0 ? series[series.length - 1].date : today;
  let cursor = lastDate;
  while (cursor < today && series.length < n) {
    cursor = addDays(cursor, 1);
    series.push({ date: cursor, percent: 0, used: null });
  }
  while (series.length < n) {
    const first = series[0].date;
    series.unshift({ date: addDays(first, -1), percent: 0, used: null });
  }
  return { series };
}

module.exports = {
  todayKey,
  addDays,
  buildSeries,
};
