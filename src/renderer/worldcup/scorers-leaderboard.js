/**
 * src/renderer/worldcup/scorers-leaderboard.js
 *
 * 从已合并比分的赛程汇总射手榜.
 *
 * 支持两种 match shape:
 *   1) 小组赛: { team1, team2, score: { scorers: [...] } }   (扁平, 来自 worldcupMatches)
 *   2) 淘汰赛: { slot1: { team: { name } }, slot2: {...}, score: { scorers: [...] } }
 *      (嵌套, 来自 worldcupBracket)
 *
 * 通过 normalizeScorersMatch 统一成 { team1, team2, scorers }.
 */

import { displayTeam } from "./teams-data.js";
import { resolvePlayerCnByName } from "./player-cn.js";

function playerKey(player, teamName) {
  return `${String(player || "")
    .trim()
    .toLowerCase()}|${teamName || ""}`;
}

/**
 * 适配 match shape: 小组赛 (扁平 team1/team2) 或 淘汰赛 (嵌套 slot1.team.name).
 * @returns {{ team1: string, team2: string, scorers: Array } | null}
 */
export function normalizeScorersMatch(m) {
  if (!m) return null;
  const t1 = m.team1 || (m.slot1 && m.slot1.team && m.slot1.team.name) || null;
  const t2 = m.team2 || (m.slot2 && m.slot2.team && m.slot2.team.name) || null;
  const scorers = m.score && Array.isArray(m.score.scorers) ? m.score.scorers : [];
  if (!t1 || !t2 || scorers.length === 0) return null;
  return { team1: t1, team2: t2, scorers };
}

/**
 * 把 bracket snapshot (r32/r16/qf/sf/final/third) 拍平成 match 数组.
 */
export function flattenBracketMatches(snapshot) {
  if (!snapshot) return [];
  const out = [];
  for (const k of ["r32", "r16", "qf", "sf"]) {
    if (Array.isArray(snapshot[k])) out.push(...snapshot[k]);
  }
  if (snapshot.final) out.push(snapshot.final);
  if (snapshot.third) out.push(snapshot.third);
  return out;
}

/**
 * @param {Array} matches 含 score.scorers 的赛程
 * @returns {Array<{ rank?: number, player: string, playerCn: string, teamName: string, teamCn: string, flag: string, goals: number, penalties: number }>}
 */
export function buildScorersLeaderboard(matches) {
  const map = new Map();

  for (const m of matches || []) {
    const norm = normalizeScorersMatch(m);
    if (!norm) continue;
    const { team1, team2, scorers } = norm;

    for (const s of scorers) {
      if (!s || !s.player || s.ownGoal) continue;

      const teamName = s.teamSide === "team1" ? team1 : team2;
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
