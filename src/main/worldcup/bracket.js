/**
 * src/main/worldcup/bracket.js
 *
 * IPC handler for worldcup bracket computation.
 *
 * 复用现有 fetcher / parser / scores-fetcher / state-store,
 * 调 bracket-rules.computeBracket 算 bracket, 写入 state.json.worldcup_bracket_snapshot.
 *
 * Test 注入点: fetcher / scores / teamsData 都是 opts, 默认走真实模块.
 */

'use strict';

const stateStore = require("../state-store");
const { computeBracket } = require("./bracket-rules");
const { mainLog } = require("../log");
const { fetchWorldcupFixtures } = require("./fetcher");

/**
 * Compute full bracket from current group standings + scores.
 *
 * @param {object} [opts]
 * @param {string} [opts.statePath] - injected for tests
 * @param {Function} [opts.fetcher] - injected for tests; defaults to fetchWorldcupFixtures
 * @param {Function} [opts.scores] - injected for tests; defaults to () => stateStore.loadWorldcupScores()
 * @param {Function} [opts.teamsData] - injected for tests
 * @param {object} [opts.groupStandings] - injected for tests; bypasses fetcher/parser path
 * @returns {Promise<{ok: boolean, snapshot?: object, reason?: string, error?: string}>}
 */
async function computeWorldcupBracket(opts = {}) {
  try {
    const fetcher = opts.fetcher;
    let fixturesR = null;
    if (fetcher) {
      fixturesR = await fetcher();
    } else {
      fixturesR = await fetchWorldcupFixtures({});
    }
    if (!fixturesR || !fixturesR.ok) {
      return { ok: false, reason: fixturesR ? fixturesR.reason : "fetch_failed" };
    }

    const data = fixturesR.data || {};
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const groups = Array.isArray(data.groups) ? data.groups : [];

    const teamsData = opts.teamsData ? opts.teamsData() : groups;
    const scores = opts.scores ? opts.scores() : loadScoresFromState();

    const groupStandings = opts.groupStandings || extractGroupStandings(matches, teamsData);
    const snapshot = computeBracket({ groupStandings, scores });

    if (!snapshot) {
      return { ok: false, reason: "no_group_data" };
    }

    try {
      if (opts.statePath) {
        stateStore.saveWorldcupBracket(snapshot, opts.statePath);
      } else {
        stateStore.saveWorldcupBracket(snapshot);
      }
    } catch (err) {
      mainLog.warn("[worldcup/bracket] state write failed", { msg: err && err.message });
    }

    return { ok: true, snapshot };
  } catch (err) {
    mainLog.warn("[worldcup/bracket] compute threw", { msg: err && err.message });
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

function loadScoresFromState() {
  try {
    const cache = stateStore.loadWorldcupScores();
    if (!cache || !cache.entries) return {};
    return cache.entries;
  } catch {
    return {};
  }
}

/**
 * Extract group standings from group-stage matches.
 * v1 simplification: rank by pts → gd → gf from already-final matches.
 *
 * @param {Array} matches - all parsed matches
 * @param {Array<{letter: string, teams: string[]}>} groupsData - from parser
 * @returns {Record<string, {winner, runnerUp, third}|null>}
 */
function extractGroupStandings(matches, groupsData) {
  const byGroup = {};
  for (const g of groupsData || []) {
    if (!g || !g.letter) continue;
    if (!byGroup[g.letter]) byGroup[g.letter] = [];
    byGroup[g.letter].push(...(g.teams || []));
  }

  const standings = {};
  for (const [letter, teams] of Object.entries(byGroup)) {
    const ranked = rankGroup(letter, matches, teams);
    standings[letter] = ranked || null;
  }
  return standings;
}

function rankGroup(letter, matches, teams) {
  const stats = {};
  for (const t of teams) stats[t] = { pts: 0, gd: 0, gf: 0, ga: 0, played: 0 };

  for (const m of matches || []) {
    const mLetter = (m.stage || "").match(/^Group\s+([A-L])/i);
    if (!mLetter || mLetter[1].toUpperCase() !== letter) continue;
    if (!m.score || m.score.status !== "final") continue;
    const ft = m.score.ft;
    if (!Array.isArray(ft)) continue;
    const [h, a] = ft;
    if (typeof h !== "number" || typeof a !== "number") continue;
    if (!stats[m.team1] || !stats[m.team2]) continue;

    stats[m.team1].played += 1;
    stats[m.team2].played += 1;
    stats[m.team1].gf += h;
    stats[m.team2].gf += a;
    stats[m.team1].ga += a;
    stats[m.team2].ga += h;
    stats[m.team1].gd += h - a;
    stats[m.team2].gd += a - h;
    if (h > a) stats[m.team1].pts += 3;
    else if (h < a) stats[m.team2].pts += 3;
    else { stats[m.team1].pts += 1; stats[m.team2].pts += 1; }
  }

  const sorted = Object.entries(stats).sort((a, b) => {
    if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
    if (b[1].gd !== a[1].gd) return b[1].gd - a[1].gd;
    if (b[1].gf !== a[1].gf) return b[1].gf - a[1].gf;
    return a[0].localeCompare(b[0]);
  });

  if (sorted.length < 3) return null;

  // best-effort: 始终返回当前 best-of 排名 (可能为 0 场赛后)
  // 用 played >= 3 标记组赛是否完赛
  const complete = sorted.length >= 3 && sorted.every(([, s]) => s.played >= 3);
  return {
    winner: sorted[0][0],
    runnerUp: sorted[1][0],
    third: { name: sorted[2][0], pts: sorted[2][1].pts, gd: sorted[2][1].gd, gf: sorted[2][1].gf, ga: sorted[2][1].ga },
    complete,
  };
}

/**
 * Load cached bracket snapshot from state.json.
 *
 * @param {object} [opts]
 * @param {string} [opts.statePath] - injected for tests
 * @returns {{ok: boolean, snapshot: object|null, reason?: string, error?: string}}
 */
function loadWorldcupBracket(opts = {}) {
  try {
    const snap = opts.statePath
      ? stateStore.loadWorldcupBracket(opts.statePath)
      : stateStore.loadWorldcupBracket();
    return { ok: true, snapshot: snap || null };
  } catch (err) {
    return { ok: false, reason: "load_failed", error: err && err.message };
  }
}

module.exports = {
  computeWorldcupBracket,
  loadWorldcupBracket,
  extractGroupStandings,
  rankGroup,
};