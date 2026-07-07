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
 * 判断一个进球是否属于"点球大战" (penalty shootout, 非 90 分/加时的常规点球).
 *
 * ponytail: ESPN 的 d.penaltyKick 同时标记 90 分/加时的常规点球 和 shootout 的点球.
 * 区分方式: shootout 进球 minute 一定是 "120'" (不带 +, 因为 shootout 是离散的 5+轮,
 * ESPN 给统一 minute=120'). 加时常规点球 minute 是 "120'+3'" / "120'+5'" 这种
 * 带 +X 补时形式.
 *
 * 同时需要 score.pen 存在 (本场有 shootout) 才视为 shootout 进球. 单独 minute
 * 形态不带 score.pen 的不算 (防止误判某些边界情况).
 */
function isShootoutGoal(scorer, score) {
  if (!scorer || !scorer.penalty) return false;
  if (!score || !Array.isArray(score.pen) || score.pen.length !== 2)
    return false;
  const minute = String(scorer.minute || "").trim();
  // shootout 形式: "120'" (exact match, no + suffix). 加时常规点球: "120'+X'" 之类.
  return /^120'$/.test(minute);
}

/**
 * 适配 match shape: 小组赛 (扁平 team1/team2) 或 淘汰赛 (嵌套 slot1.team.name).
 * @returns {{ team1: string, team2: string, scorers: Array, score: object } | null}
 */
export function normalizeScorersMatch(m) {
  if (!m) return null;
  const t1 = m.team1 || (m.slot1 && m.slot1.team && m.slot1.team.name) || null;
  const t2 = m.team2 || (m.slot2 && m.slot2.team && m.slot2.team.name) || null;
  const score = m.score || null;
  const scorers = score && Array.isArray(score.scorers) ? score.scorers : [];
  if (!t1 || !t2 || scorers.length === 0) return null;
  return { team1: t1, team2: t2, scorers, score };
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
    const { team1, team2, scorers, score } = norm;

    for (const s of scorers) {
      if (!s || !s.player || s.ownGoal) continue;

      // ponytail: 点球大战进球不进射手榜. ESPN 把 shootout 点球也标 d.penaltyKick=true,
      // minute 是 "120'" (无 + 后缀, 因为 shootout 离散轮次). 跟加时阶段的常规点球
      // (minute 是 "120'+X'") 区分. isShootoutGoal 同时要求 score.pen 存在.
      if (isShootoutGoal(s, score)) continue;

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
