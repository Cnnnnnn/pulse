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

/**
 * Resolve one slot spec (from Annex C template) against group results.
 * Returns { team: { name } | null, source: string, ... }.
 *
 * @param {{type: 'group', rank: string, group: string} | {type: 'best-third', pool: string[]}} slotSpec
 * @param {Record<string, {winner?: string, runnerUp?: string, third?: string}>} groupResults
 * @returns {{team: {name: string} | null, source: string, rank?: string, group?: string, pool?: string[]}}
 */
function resolveSlot(slotSpec, groupResults) {
  if (slotSpec.type === 'group') {
    const gr = groupResults[slotSpec.group] || {};
    const teamName = gr[slotSpec.rank];
    if (!teamName) {
      return { team: null, source: `group:${slotSpec.group}:${slotSpec.rank}`, rank: slotSpec.rank, group: slotSpec.group };
    }
    return { team: { name: teamName }, source: `group:${slotSpec.group}:${slotSpec.rank}`, rank: slotSpec.rank, group: slotSpec.group };
  }
  if (slotSpec.type === 'best-third') {
    return { team: null, source: 'best-third-pool', pool: slotSpec.pool };
  }
  return { team: null, source: 'unknown' };
}

function sourceLabel(slotSpec) {
  if (slotSpec.type === 'group') return `group:${slotSpec.group}:${slotSpec.rank}`;
  if (slotSpec.type === 'best-third') return `best-third:${slotSpec.pool.join(',')}`;
  return 'unknown';
}

/**
 * Resolve 16 Round-of-32 matches from Annex C template + group results.
 *
 * @param {object} annexConfig (from matchAnnexCCase)
 * @param {Record<string, {winner?: string, runnerUp?: string, third?: string}>} groupResults
 * @returns {Array<{matchNum: number, slot1: object, slot2: object, score: null, status: string, source1: string, source2: string}>}
 */
function resolveR32Matchups(annexConfig, groupResults) {
  return annexConfig.r32Matches_73_88.map((tmpl) => {
    const slot1 = resolveSlot(tmpl.slot1, groupResults);
    const slot2 = resolveSlot(tmpl.slot2, groupResults);
    return {
      matchNum: tmpl.num,
      slot1,
      slot2,
      score: null,
      status: slot1.team && slot2.team ? 'pending' : 'projected',
      source1: sourceLabel(tmpl.slot1),
      source2: sourceLabel(tmpl.slot2),
    };
  });
}

/**
 * Determine winner of a finished match from its score. Returns 'slot1' / 'slot2' / null.
 * Considers 90min (ft), extra time (et), then penalties (pen).
 *
 * @param {{ft?: [number, number], et?: [number, number], pen?: [number, number]}|null} score
 * @returns {'slot1' | 'slot2' | null}
 */
function determineWinner(score) {
  if (!score || !score.ft) return null;
  const [h, a] = score.ft;
  if (h > a) return 'slot1';
  if (h < a) return 'slot2';
  if (score.et && Array.isArray(score.et)) {
    const [eh, ea] = score.et;
    if (eh > ea) return 'slot1';
    if (eh < ea) return 'slot2';
  }
  if (score.pen && Array.isArray(score.pen)) {
    const [ph, pa] = score.pen;
    if (ph > pa) return 'slot1';
    if (ph < pa) return 'slot2';
  }
  return null;
}

function parseSource(src) {
  const m = String(src || '').match(/^([a-z0-9]+):(\d+)(-loser)?$/);
  if (!m) return { stage: null, num: null, loser: false };
  return { stage: m[1], num: parseInt(m[2], 10), loser: !!m[3] };
}

function resolveFromSource(parsed, prevByNum) {
  if (!parsed.stage || !parsed.num) return { team: null, source: 'invalid' };
  const prev = prevByNum.get(parsed.num);
  if (!prev) return { team: null, source: `${parsed.stage}:${parsed.num}` };
  const winnerKey = determineWinner(prev.score);
  if (winnerKey === null) {
    return { team: null, source: `${parsed.stage}:${parsed.num}${parsed.loser ? '-loser' : ''}` };
  }
  const winnerSlot = winnerKey === 'slot1' ? prev.slot1 : prev.slot2;
  const loserSlot = winnerKey === 'slot1' ? prev.slot2 : prev.slot1;
  const chosen = parsed.loser ? loserSlot : winnerSlot;
  return {
    team: chosen ? chosen.team : null,
    source: `${parsed.stage}:${parsed.num}${parsed.loser ? '-loser' : ''}`,
  };
}

/**
 * Propagate winners/losers from a previous stage into the next stage slots.
 *
 * @param {Array} prevMatches - previous stage matches (with score on each)
 * @param {Array<{num: number, sources: string[]}>} nextTemplate - next stage template (from ANNEX_C_DEFAULT)
 * @returns {Array<{matchNum: number, slot1: object, slot2: object, score: null, status: string, source1: string, source2: string}>}
 */
function propagateWinner(prevMatches, nextTemplate) {
  const prevByNum = new Map((prevMatches || []).map((m) => [m.matchNum, m]));
  return (nextTemplate || []).map((tmpl) => {
    const sources = tmpl.sources.map((src) => parseSource(src));
    const slot1 = resolveFromSource(sources[0], prevByNum);
    const slot2 = resolveFromSource(sources[1], prevByNum);
    return {
      matchNum: tmpl.num,
      slot1,
      slot2,
      score: null,
      status: slot1.team && slot2.team ? 'pending' : 'projected',
      source1: tmpl.sources[0],
      source2: tmpl.sources[1],
    };
  });
}

/**
 * Simple non-cryptographic hash for inputs fingerprint.
 * @param {object} groupStandings
 * @param {object} scores
 * @returns {string} 8-char hex
 */
function simpleHash(groupStandings, scores) {
  const payload = JSON.stringify({ g: groupStandings, s: scores });
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = ((hash << 5) - hash) + payload.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Compute the full knockout bracket from current group standings + scores.
 *
 * @param {{groupStandings: object, scores?: object}} input
 * @returns {object|null} BracketSnapshot or null if no group data
 */
function computeBracket({ groupStandings, scores } = {}) {
  if (!groupStandings || typeof groupStandings !== 'object' || Object.keys(groupStandings).length === 0) {
    return null;
  }

  const warnings = [];
  const groupResults = {};
  const thirdStandings = {};

  for (const [letter, gs] of Object.entries(groupStandings)) {
    if (!gs) {
      warnings.push(`group_${letter}_incomplete`);
      continue;
    }
    groupResults[letter] = {
      winner: gs.winner || null,
      runnerUp: gs.runnerUp || null,
      third: gs.third && gs.third.name ? gs.third.name : null,
    };
    if (gs.third) {
      thirdStandings[letter] = {
        pts: gs.third.pts || 0,
        gd: gs.third.gd || 0,
        gf: gs.third.gf || 0,
      };
    }
  }

  const sortedThird = sortThirdPlaced(thirdStandings);
  const advancing = selectThirdPlaced(sortedThird, 8);
  const annex = matchAnnexCCase(advancing);
  if (annex.rowIndex !== 0) warnings.push('annexC_unexpected_row');

  const r32 = resolveR32Matchups(annex.config, groupResults);
  const r16 = propagateWinner(r32, annex.config.r16Matches_89_96);
  const qf = propagateWinner(r16, annex.config.qfMatches_97_100);
  const sf = propagateWinner(qf, annex.config.sfMatches_101_102);
  const finalArr = propagateWinner(sf, [annex.config.finalMatch]);
  const thirdArr = propagateWinner(sf, [annex.config.thirdMatch]);
  const finalMatch = finalArr[0];
  const thirdMatch = thirdArr[0];

  warnings.push('simplified_annex_c_default_row');

  const completeGroups = Object.values(groupStandings).filter((g) => g && g.winner && g.runnerUp);
  const projected = completeGroups.length < 12 || advancing.length < 8;
  if (projected) warnings.push('bracket_partial');

  return {
    version: 1,
    computedAt: Date.now(),
    inputsHash: 'sha256:' + simpleHash(groupStandings, scores || {}),
    projected,
    r32,
    r16,
    qf,
    sf,
    final: finalMatch,
    third: thirdMatch,
    thirdPlacedAdvancing: advancing,
    annexCIndex: annex.rowIndex,
    warnings,
  };
}

module.exports = {
  sortThirdPlaced,
  selectThirdPlaced,
  matchAnnexCCase,
  resolveR32Matchups,
  propagateWinner,
  computeBracket,
  determineWinner,
  parseSource,
  ANNEX_C_DEFAULT,
};
