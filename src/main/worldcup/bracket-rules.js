/**
 * src/main/worldcup/bracket-rules.js
 *
 * 2026 世界杯淘汰赛 bracket 计算 - 纯函数库 (无 IO, 易测)
 *
 * 数据契约:
 *   matches:    [{ stage, team1, team2, score, date, time, ... }]
 *   scores:     { [matchKey]: { ft, status, et?, pen? } }]
 *   teamsData:  [{ group: 'A', name: 'Mexico', cn: '墨西哥', ... }]
 */

/**
 * Sort 12 third-placed teams by FIFA criteria: pts DESC → gd DESC → gf DESC.
 *
 * @param {Record<string, {pts?: number, gd?: number, gf?: number}>} standings
 * @returns {Array<{group: string, pts: number, gd: number, gf: number}>}
 */
function sortThirdPlaced(standings) {
  const arr = Object.entries(standings || {})
    .map(([group, s]) => ({
      group,
      pts: (s && s.pts) || 0,
      gd: (s && s.gd) || 0,
      gf: (s && s.gf) || 0,
    }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.group.localeCompare(b.group);
    });
  return arr;
}

/**
 * Pick top N group letters by sortThirdPlaced ranking.
 *
 * @param {Array<{group: string}>} sortedThird
 * @param {number} [n=8]
 * @returns {string[]}
 */
function selectThirdPlaced(sortedThird, n = 8) {
  return sortedThird.slice(0, n).map((s) => s.group);
}

// ─── Annex C 默认 row 1 + R32+ 全部 32 场映射 ──────────────────
// FIFA Annex C row 1: 4 runner-up 互打 + 8 winner 打 best-third
// 简化 v1: 走 row 1 默认, warning 'simplified_annex_c_default_row'
// 495 行完整表 v2 再补.

const ANNEX_C_DEFAULT = {
  r32Matches_73_88: [
    { num: 73, slot1: { type: 'group', rank: 'runnerUp', group: 'A' }, slot2: { type: 'group', rank: 'runnerUp', group: 'B' } },
    { num: 74, slot1: { type: 'group', rank: 'winner', group: 'E' }, slot2: { type: 'best-third', pool: ['A', 'B', 'C', 'D', 'F'] } },
    { num: 75, slot1: { type: 'group', rank: 'winner', group: 'F' }, slot2: { type: 'group', rank: 'runnerUp', group: 'C' } },
    { num: 76, slot1: { type: 'group', rank: 'winner', group: 'C' }, slot2: { type: 'group', rank: 'runnerUp', group: 'F' } },
    { num: 77, slot1: { type: 'group', rank: 'winner', group: 'I' }, slot2: { type: 'best-third', pool: ['C', 'D', 'F', 'G', 'H'] } },
    { num: 78, slot1: { type: 'group', rank: 'runnerUp', group: 'E' }, slot2: { type: 'group', rank: 'runnerUp', group: 'I' } },
    { num: 79, slot1: { type: 'group', rank: 'winner', group: 'A' }, slot2: { type: 'best-third', pool: ['C', 'E', 'F', 'H', 'I'] } },
    { num: 80, slot1: { type: 'group', rank: 'winner', group: 'L' }, slot2: { type: 'best-third', pool: ['E', 'H', 'I', 'J', 'K'] } },
    { num: 81, slot1: { type: 'group', rank: 'winner', group: 'D' }, slot2: { type: 'best-third', pool: ['B', 'E', 'F', 'I', 'J'] } },
    { num: 82, slot1: { type: 'group', rank: 'winner', group: 'G' }, slot2: { type: 'best-third', pool: ['A', 'E', 'H', 'I', 'J'] } },
    { num: 83, slot1: { type: 'group', rank: 'runnerUp', group: 'K' }, slot2: { type: 'group', rank: 'runnerUp', group: 'L' } },
    { num: 84, slot1: { type: 'group', rank: 'winner', group: 'H' }, slot2: { type: 'group', rank: 'runnerUp', group: 'J' } },
    { num: 85, slot1: { type: 'group', rank: 'winner', group: 'B' }, slot2: { type: 'best-third', pool: ['E', 'F', 'G', 'I', 'J'] } },
    { num: 86, slot1: { type: 'group', rank: 'winner', group: 'J' }, slot2: { type: 'group', rank: 'runnerUp', group: 'H' } },
    { num: 87, slot1: { type: 'group', rank: 'winner', group: 'K' }, slot2: { type: 'best-third', pool: ['D', 'E', 'I', 'J', 'L'] } },
    { num: 88, slot1: { type: 'group', rank: 'runnerUp', group: 'D' }, slot2: { type: 'group', rank: 'runnerUp', group: 'G' } },
  ],
  r16Matches_89_96: [
    { num: 89, sources: ['r32:74', 'r32:77'] },
    { num: 90, sources: ['r32:73', 'r32:75'] },
    { num: 91, sources: ['r32:76', 'r32:78'] },
    { num: 92, sources: ['r32:79', 'r32:80'] },
    { num: 93, sources: ['r32:83', 'r32:84'] },
    { num: 94, sources: ['r32:81', 'r32:82'] },
    { num: 95, sources: ['r32:86', 'r32:88'] },
    { num: 96, sources: ['r32:85', 'r32:87'] },
  ],
  qfMatches_97_100: [
    { num: 97, sources: ['r16:89', 'r16:90'] },
    { num: 98, sources: ['r16:93', 'r16:94'] },
    { num: 99, sources: ['r16:91', 'r16:92'] },
    { num: 100, sources: ['r16:95', 'r16:96'] },
  ],
  sfMatches_101_102: [
    { num: 101, sources: ['qf:97', 'qf:98'] },
    { num: 102, sources: ['qf:99', 'qf:100'] },
  ],
  finalMatch: { num: 104, sources: ['sf:101', 'sf:102'] },
  thirdMatch: { num: 103, sources: ['sf:101-loser', 'sf:102-loser'] },
};

/**
 * Match the 8 advancing third-placed group letters against FIFA Annex C table.
 * v1 simplification: always returns row 1 (default).
 *
 * @param {string[]} advancingGroups
 * @returns {{rowIndex: number, config: object}}
 */
function matchAnnexCCase(_advancingGroups) {
  return { rowIndex: 0, config: ANNEX_C_DEFAULT };
}

module.exports = {
  sortThirdPlaced,
  selectThirdPlaced,
  matchAnnexCCase,
  ANNEX_C_DEFAULT,
};
