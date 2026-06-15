/**
 * src/utils/match-key.js
 *
 * 跟 src/main/worldcup/match-key.js 的 matchKey() 保持一致 — 用于 renderer
 * 给 match row 加 data-match-key 跟 main 进程 goal-watcher 算的 key 对齐.
 */

export function matchKey(match) {
  if (!match) return "";
  return `${match.date || ""}|${match.time || ""}|${match.team1 || ""}|${match.team2 || ""}`;
}
