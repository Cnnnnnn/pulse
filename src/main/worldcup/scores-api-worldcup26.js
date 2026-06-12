/**
 * src/main/worldcup/scores-api-worldcup26.js
 *
 * 第二层比分源: https://worldcup26.ir/get/games (免费, 无需 API key)
 */

const {
  canonicalTeamName,
  fixtureLookupKey,
  gameLookupKey,
} = require("./team-aliases");
const { isMatchStarted } = require("./match-key");
const { mainLog } = require("../log");

const GAMES_URL = "https://worldcup26.ir/get/games";

function scoreEntryFromGame(game, fixture) {
  if (!game) return null;
  const home = parseInt(game.home_score, 10);
  const away = parseInt(game.away_score, 10);
  if (Number.isNaN(home) || Number.isNaN(away)) return null;

  const finished = String(game.finished || "").toUpperCase() === "TRUE";
  const elapsed = String(game.time_elapsed || "").toLowerCase();
  const notStarted = elapsed === "notstarted" || elapsed === "";

  if (notStarted && !finished) {
    // API 未及时更新时, 本地开球时间已过 → 仍标为进行中 (0-0 也展示)
    if (fixture && isMatchStarted(fixture)) {
      return {
        ft: [home, away],
        ht: null,
        status: "live",
        updatedAt: Date.now(),
        source: "worldcup26",
      };
    }
    return null;
  }

  let status = "live";
  if (finished || elapsed === "finished") status = "final";

  return {
    ft: [home, away],
    ht: null,
    status,
    updatedAt: Date.now(),
    source: "worldcup26",
  };
}

function orientScoreForFixture(entry, game, fixture) {
  if (!entry || !game || !fixture) return null;
  const home = canonicalTeamName(game.home_team_name_en);
  const away = canonicalTeamName(game.away_team_name_en);
  const t1 = canonicalTeamName(fixture.team1);
  const t2 = canonicalTeamName(fixture.team2);

  if (home === t1 && away === t2) {
    return { ...entry, ft: [...entry.ft] };
  }
  if (home === t2 && away === t1) {
    return { ...entry, ft: [entry.ft[1], entry.ft[0]] };
  }
  return null;
}

/**
 * @param {Array} games
 * @param {Array<{date,time,team1,team2}>} fixtures
 * @param {import('./match-key').matchKey} matchKeyFn
 * @returns {Record<string, object>}
 */
function mapGamesToScoreEntries(games, fixtures, matchKeyFn) {
  const byLookup = new Map();
  for (const g of games || []) {
    const lk = gameLookupKey(g);
    if (lk) byLookup.set(lk, g);
  }

  const out = {};
  for (const fixture of fixtures || []) {
    const lk = fixtureLookupKey(fixture);
    const game = byLookup.get(lk);
    if (!game) continue;
    const raw = scoreEntryFromGame(game, fixture);
    const entry = orientScoreForFixture(raw, game, fixture);
    if (!entry) continue;
    out[matchKeyFn(fixture)] = entry;
  }
  return out;
}

/**
 * @param {import('../http-client').HttpClient} http
 * @param {Array} fixtures
 * @param {Function} matchKeyFn
 */
async function fetchScoresFromWorldcup26(http, fixtures, matchKeyFn) {
  try {
    const r = await http.get(GAMES_URL, { timeout: 12000 });
    if (!r || r.error || !r.body) {
      mainLog.warn("[worldcup/scores-api-worldcup26] fetch failed", {
        error: r && r.error,
        status: r && r.status,
      });
      return {};
    }
    if (r.status && r.status >= 400) {
      mainLog.warn("[worldcup/scores-api-worldcup26] bad status", {
        status: r.status,
      });
      return {};
    }
    const data = JSON.parse(r.body);
    const games = data && Array.isArray(data.games) ? data.games : [];
    return mapGamesToScoreEntries(games, fixtures, matchKeyFn);
  } catch (err) {
    mainLog.warn("[worldcup/scores-api-worldcup26] threw", {
      msg: err && err.message,
    });
    return {};
  }
}

module.exports = {
  GAMES_URL,
  scoreEntryFromGame,
  mapGamesToScoreEntries,
  fetchScoresFromWorldcup26,
};
