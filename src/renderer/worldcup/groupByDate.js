/**
 * src/renderer/worldcup/groupByDate.js
 *
 * v2.9.0 世界杯专栏 — renderer 端 groupMatchesByDate (跟 main/worldcup/parser.js 同步)
 *
 * 跟 main 端版本逻辑一致, 但 renderer 不 require main (跨进程边界).
 * 拍 6.6: 跟版本检查 主体 完全独立, 0 共享模块, 各自维护.
 *
 * @param {Array<{date, time, ...}>} matches
 * @returns {Array<{date, weekday, matches}>}
 */
export function groupMatchesByDate(matches) {
  const map = new Map();
  for (const m of matches || []) {
    if (!m.date) continue;
    if (!map.has(m.date)) {
      map.set(m.date, { date: m.date, weekday: m.weekday || '', matches: [] });
    }
    map.get(m.date).matches.push(m);
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}
