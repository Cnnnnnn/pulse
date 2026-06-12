/**
 * src/renderer/worldcup/scorers-leaderboard.js
 *
 * 从已合并比分的赛程汇总射手榜
 */

import { displayTeam } from "./teams-data.js";
import { resolvePlayerCnByName } from "./player-cn.js";

function playerKey(player, teamName) {
  return `${String(player || "")
    .trim()
    .toLowerCase()}|${teamName || ""}`;
}

/**
 * @param {Array} matches 含 score.scorers 的赛程
 * @returns {Array<{ rank?: number, player: string, playerCn: string, teamName: string, teamCn: string, flag: string, goals: number, penalties: number }>}
 */
export function buildScorersLeaderboard(matches) {
  const map = new Map();

  for (const m of matches || []) {
    const scorers =
      m.score && Array.isArray(m.score.scorers) ? m.score.scorers : [];
    if (scorers.length === 0) continue;

    for (const s of scorers) {
      if (!s || !s.player || s.ownGoal) continue;

      const teamName = s.teamSide === "team1" ? m.team1 : m.team2;
      if (!teamName) continue;

      const key = playerKey(s.player, teamName);
      const display = displayTeam(teamName);
      let row = map.get(key);
      if (!row) {
        row = {
          player: s.player,
          playerCn: resolvePlayerCnByName(s.player),
          teamName: display.officialName,
          teamCn: display.cn,
          flag: display.flag,
          goals: 0,
          penalties: 0,
        };
        map.set(key, row);
      }
      row.goals += 1;
      if (s.penalty) row.penalties += 1;
    }
  }

  const list = [...map.values()].sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    const ac = a.playerCn || a.player;
    const bc = b.playerCn || b.player;
    return ac.localeCompare(bc, "zh");
  });

  let rank = 0;
  let prevGoals = null;
  return list.map((row, idx) => {
    if (row.goals !== prevGoals) {
      rank = idx + 1;
      prevGoals = row.goals;
    }
    return { ...row, rank };
  });
}

export function filterScorersLeaderboard(list, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) =>
      r.player.toLowerCase().includes(q) ||
      (r.playerCn && r.playerCn.includes(q)) ||
      r.teamName.toLowerCase().includes(q) ||
      r.teamCn.includes(q),
  );
}
