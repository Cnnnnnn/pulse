/**
 * src/main/worldcup/scores-api-worldcup26.ts
 *
 * 第二层比分源: https://worldcup26.ir/get/games (免费, 无需 API key)
 */
"use strict";

const {
  canonicalTeamName,
  fixtureLookupKey,
  gameLookupKey,
} = require("./team-aliases.ts");
const { isMatchStarted } = require("./match-key.ts");
const { mainLog } = require("../log.ts");

const GAMES_URL = "https://worldcup26.ir/get/games";

export function scoreEntryFromGame(game: any, fixture: any): any {
  if (!game) return null;
  const home = parseInt(game.home_score, 10);
  const away = parseInt(game.away_score, 10);
  if (Number.isNaN(home) || Number.isNaN(away)) return null;

  const finished = String(game.finished || "").toUpperCase() === "TRUE";
  const elapsed = String(game.time_elapsed || "").toLowerCase();
  const notStarted = elapsed === "notstarted" || elapsed === "";

  if (notStarted && !finished) {
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

function orientScoreForFixture(entry: any, game: any, fixture: any): any {
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

export function mapGamesToScoreEntries(games: any, fixtures: any, matchKeyFn: any): Record<string, any> {
  const byLookup = new Map<string, any>();
  for (const g of games || []) {
    const lk = gameLookupKey(g);
    if (lk) byLookup.set(lk, g);
  }

  const out: Record<string, any> = {};
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

export async function fetchScoresFromWorldcup26(http: any, fixtures: any, matchKeyFn: any): Promise<Record<string, any>> {
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
  } catch (err: any) {
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