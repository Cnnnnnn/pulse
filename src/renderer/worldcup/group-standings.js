/**
 * src/renderer/worldcup/group-standings.js
 *
 * 小组赛积分榜：按积分、净胜球排序
 */

import { canonicalTeamName } from "./team-canonical.js";

function emptyStanding() {
  return { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

function groupLetterFromStage(stage) {
  if (!stage || typeof stage !== "string") return null;
  const m = stage.match(/^Group\s+([A-L])$/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * @param {Array<{ name: string }>} teams
 * @returns {Map<string, string>} canonical -> teams-data name
 */
function buildCanonicalIndex(teams) {
  const map = new Map();
  for (const t of teams || []) {
    if (!t || !t.name) continue;
    map.set(canonicalTeamName(t.name), t.name);
  }
  return map;
}

function resolveTeamKey(matchName, canonicalIndex) {
  const key = canonicalTeamName(matchName);
  return canonicalIndex.get(key) || null;
}

/**
 * @param {Array} matches 已合并比分的赛程
 * @param {Array<{ name: string, group: string }>} teams
 * @returns {Record<string, Record<string, object>>} groupLetter -> teamName -> standing
 */
export function computeGroupStandings(matches, teams) {
  const canonicalIndex = buildCanonicalIndex(teams);
  const byGroup = {};

  for (const t of teams || []) {
    if (!t || !t.group || !t.name) continue;
    if (!byGroup[t.group]) byGroup[t.group] = {};
    byGroup[t.group][t.name] = emptyStanding();
  }

  for (const m of matches || []) {
    const group = groupLetterFromStage(m.stage);
    if (!group || !byGroup[group]) continue;

    const score = m.score;
    if (!score || !score.ft || score.status !== "final") continue;

    const homeKey = resolveTeamKey(m.team1, canonicalIndex);
    const awayKey = resolveTeamKey(m.team2, canonicalIndex);
    if (!homeKey || !awayKey) continue;
    if (!byGroup[group][homeKey] || !byGroup[group][awayKey]) continue;

    const [hg, ag] = score.ft;
    if (typeof hg !== "number" || typeof ag !== "number") continue;

    const home = byGroup[group][homeKey];
    const away = byGroup[group][awayKey];

    home.played += 1;
    away.played += 1;
    home.gf += hg;
    home.ga += ag;
    away.gf += ag;
    away.ga += hg;
    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;

    if (hg > ag) {
      home.won += 1;
      home.pts += 3;
      away.lost += 1;
    } else if (hg < ag) {
      away.won += 1;
      away.pts += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.pts += 1;
      away.pts += 1;
    }
  }

  return byGroup;
}

/**
 * @param {object} a team
 * @param {object} b team
 * @param {Record<string, Record<string, object>>} standings
 */
export function compareTeamsByStandings(a, b, standings) {
  const sa =
    (standings[a.group] && standings[a.group][a.name]) || emptyStanding();
  const sb =
    (standings[b.group] && standings[b.group][b.name]) || emptyStanding();

  if (sb.pts !== sa.pts) return sb.pts - sa.pts;
  if (sb.gd !== sa.gd) return sb.gd - sa.gd;
  if (sb.gf !== sa.gf) return sb.gf - sa.gf;
  return (a.cn || a.name).localeCompare(b.cn || b.name, "zh");
}

export function sortTeamsInGroup(teamList, standings, groupLetter) {
  const groupStandings = standings[groupLetter] || {};
  return [...teamList].sort((a, b) => {
    const sa = groupStandings[a.name] || emptyStanding();
    const sb = groupStandings[b.name] || emptyStanding();
    if (sb.pts !== sa.pts) return sb.pts - sa.pts;
    if (sb.gd !== sa.gd) return sb.gd - sa.gd;
    if (sb.gf !== sa.gf) return sb.gf - sa.gf;
    return (a.cn || a.name).localeCompare(b.cn || b.name, "zh");
  });
}

export function formatGoalDiff(gd) {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}
