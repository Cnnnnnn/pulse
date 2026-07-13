/**
 * src/newcar/aggregate.js
 *
 * 聚合纯函数: 按月 / 按日分组 + KPI 计算. 无 Preact 依赖.
 */

/**
 * "YYYY-MM" -> ReleaseRecord[]
 * @param {import('./types.js').ReleaseRecord[]} list
 * @returns {Map<string, import('./types.js').ReleaseRecord[]>}
 */
export function groupByMonth(list) {
  const m = new Map();
  for (const r of list || []) {
    const key = r.releaseDate.slice(0, 7);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }
  return m;
}

/**
 * "YYYY-MM-DD" -> ReleaseRecord[]
 * @param {import('./types.js').ReleaseRecord[]} list
 * @returns {Map<string, import('./types.js').ReleaseRecord[]>}
 */
export function groupByDate(list) {
  const m = new Map();
  for (const r of list || []) {
    const key = r.releaseDate;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }
  return m;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * 计算 KPI: 本月 / 本周 / 今年累计(至今天) / 即将发布(>今天).
 * releaseDate 视为本地"所在日", 不做时区换算.
 * @param {import('./types.js').ReleaseRecord[]} list
 * @param {Date} [now]
 * @returns {import('./types.js').Kpis}
 */
export function computeKpis(list, now) {
  const today = startOfDay(now || new Date());
  const y = today.getFullYear();
  const m = today.getMonth();
  const thisMonthKey = `${y}-${String(m + 1).padStart(2, '0')}`;

  // 本周一 (周一为一周起点)
  const dow = today.getDay(); // 0=日
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const weekStart = startOfDay(addDays(today, diffToMon));
  const weekEnd = startOfDay(addDays(weekStart, 7));

  let thisMonth = 0;
  let thisWeek = 0;
  let ytd = 0;
  let upcoming = 0;

  for (const r of list || []) {
    const rd = startOfDay(new Date(`${r.releaseDate}T00:00:00`));
    if (r.releaseDate.slice(0, 7) === thisMonthKey) thisMonth++;
    if (rd >= weekStart && rd < weekEnd) thisWeek++;
    if (rd.getFullYear() === y && rd <= today) ytd++;
    if (rd > today) upcoming++;
  }
  return { thisMonth, thisWeek, ytd, upcoming };
}
