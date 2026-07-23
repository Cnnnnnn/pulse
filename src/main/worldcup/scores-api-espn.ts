/**
 * src/main/worldcup/scores-api-espn.ts
 *
 * 第三层比分源 (实时优先): ESPN site API — soccer/fifa.world/scoreboard
 * 无需 API key; Electron 主进程拉取无 CORS 问题.
 */
"use strict";

const { canonicalTeamName, teamsPairKey } = require("./team-aliases.ts");
const { matchKickoffUtcMs } = require("./match-key.ts");
const { mainLog } = require("../log.ts");

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const KICKOFF_MATCH_TOLERANCE_MS = 3 * 60 * 60 * 1000;

function yyyymmddFromUtcMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function collectDateParams(fixtures: any[]): string {
  const set = new Set<string>();
  for (const f of fixtures || []) {
    if (f.date) set.add(f.date.replace(/-/g, ""));
    const kickoff = matchKickoffUtcMs(f);
    if (kickoff != null) set.add(yyyymmddFromUtcMs(kickoff));
  }
  const sorted = [...set].sort();
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

export function scoreEntryFromEspnEvent(event: any): any {
  if (!event || !event.competitions || !event.competitions[0]) return null;
  const comp = event.competitions[0];
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");
  if (!home || !away) return null;

  const homeScore = parseInt(home.score, 10);
  const awayScore = parseInt(away.score, 10);
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;

  const state =
    event.status && event.status.type ? event.status.type.state : "";
  if (state === "pre") return null;

  const status = state === "post" ? "final" : "live";
  const clock =
    event.status && event.status.displayClock
      ? event.status.displayClock
      : null;

  return {
    ft: [homeScore, awayScore],
    ht: null,
    status,
    clock,
    updatedAt: Date.now(),
    source: "espn",
  };
}

function _teamId(competitor: any): string | null {
  if (!competitor) return null;
  if (competitor.team && competitor.team.id != null)
    return String(competitor.team.id);
  if (competitor.id != null) return String(competitor.id);
  return null;
}

function _fixtureTeamSideForEspnHome(homeName: any, fixture: any): any {
  const t1 = canonicalTeamName(fixture.team1);
  const t2 = canonicalTeamName(fixture.team2);
  const eh = canonicalTeamName(homeName);
  if (eh === t1) return { home: "team1", away: "team2" };
  if (eh === t2) return { home: "team2", away: "team1" };
  return null;
}

/**
 * ponytail: 加时 (et) 和点球大战 (pen) 比分从 scorers 反推.
 */
export function deriveEtPenFromScorers(scorers: any[]): { et: [number, number] | null; pen: [number, number] | null } {
  if (!Array.isArray(scorers) || scorers.length === 0) {
    return { et: null, pen: null };
  }
  let t1Et = 0;
  let t2Et = 0;
  let t1Pen = 0;
  let t2Pen = 0;
  let hasShootout = false;
  let hasEtGoal = false;
  for (const s of scorers) {
    if (!s) continue;
    const minute = String(s.minute || "").trim();
    if (!minute) continue;
    if (minute === "120'") {
      hasShootout = true;
      if (s.teamSide === "team1") t1Pen++;
      else if (s.teamSide === "team2") t2Pen++;
      continue;
    }
    const etMatch = minute.match(/^(\d{2,3})'(?:\+(\d+))?'?$/);
    if (!etMatch) continue;
    const base = parseInt(etMatch[1], 10);
    if (base >= 91 && base <= 120) {
      hasEtGoal = true;
      if (s.teamSide === "team1") t1Et++;
      else if (s.teamSide === "team2") t2Et++;
    }
  }
  return {
    et: hasEtGoal ? [t1Et, t2Et] : null,
    pen: hasShootout ? [t1Pen, t2Pen] : null,
  };
}

export function scorersFromEspnEvent(event: any, fixture: any): any[] {
  if (!event || !fixture) return [];
  const comp = event.competitions && event.competitions[0];
  if (!comp) return [];
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");
  if (!home || !away) return [];

  const hName =
    home.team && (home.team.displayName || home.team.shortDisplayName);
  const sideMap = _fixtureTeamSideForEspnHome(hName, fixture);
  if (!sideMap) return [];

  const homeId = _teamId(home);
  const awayId = _teamId(away);
  const out: any[] = [];

  for (const d of comp.details || []) {
    if (!d || !d.scoringPlay) continue;
    const athlete =
      Array.isArray(d.athletesInvolved) && d.athletesInvolved[0]
        ? d.athletesInvolved[0]
        : null;
    if (!athlete) continue;

    const detailTeamId = d.team && d.team.id != null ? String(d.team.id) : null;
    let teamSide = null;
    if (detailTeamId && homeId && detailTeamId === homeId)
      teamSide = sideMap.home;
    else if (detailTeamId && awayId && detailTeamId === awayId)
      teamSide = sideMap.away;
    if (!teamSide) continue;

    out.push({
      minute: (d.clock && d.clock.displayValue) || "",
      player:
        athlete.displayName || athlete.shortName || athlete.fullName || "",
      teamSide,
      type: (d.type && d.type.text) || "Goal",
      ownGoal: !!d.ownGoal,
      penalty: !!d.penaltyKick,
    });
  }

  out.sort((a, b) => {
    const ma = parseInt(String(a.minute).replace(/\D/g, ""), 10) || 0;
    const mb = parseInt(String(b.minute).replace(/\D/g, ""), 10) || 0;
    return ma - mb;
  });
  return out;
}

export function orientEspnScore(entry: any, event: any, fixture: any): any {
  if (!entry || !event || !fixture) return null;
  const comp = event.competitions[0];
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");
  if (!home || !away) return null;

  const hName =
    home.team && (home.team.displayName || home.team.shortDisplayName);
  const aName =
    away.team && (away.team.displayName || away.team.shortDisplayName);
  const fixtureTeam1Clean = stripPollutedTail(fixture.team1);
  const fixtureTeam2Clean = stripPollutedTail(fixture.team2);
  const t1 = canonicalTeamName(fixtureTeam1Clean);
  const t2 = canonicalTeamName(fixtureTeam2Clean);
  const eh = canonicalTeamName(hName);
  const ea = canonicalTeamName(aName);

  const scorers = scorersFromEspnEvent(event, fixture);

  const derived = deriveEtPenFromScorers(scorers);

  if (eh === t1 && ea === t2) {
    return {
      ...entry,
      ft: [...entry.ft],
      scorers,
      ...(derived.et ? { et: [...derived.et] } : {}),
      ...(derived.pen ? { pen: [...derived.pen] } : {}),
    };
  }
  if (eh === t2 && ea === t1) {
    return {
      ...entry,
      ft: [entry.ft[1], entry.ft[0]],
      scorers: scorers.map((s) => ({
        ...s,
        teamSide: s.teamSide === "team1" ? "team2" : "team1",
      })),
      ...(derived.et ? { et: [derived.et[1], derived.et[0]] } : {}),
      ...(derived.pen ? { pen: [derived.pen[1], derived.pen[0]] } : {}),
    };
  }
  return null;
}

export function stripPollutedTail(name: any): string {
  if (typeof name !== "string") return name;
  if (!/a\.e\.t\.|pen\.?\s*\d/i.test(name)) return name;
  const matches = name.match(/[A-Z][a-zA-ZÀ-ÿ' .-]+(?=$)/g);
  if (matches && matches.length > 0) return matches[matches.length - 1].trim();
  return name;
}

export function eventMatchesFixture(event: any, fixture: any): boolean {
  if (!event || !fixture) return false;
  const comp = event.competitions && event.competitions[0];
  if (!comp) return false;
  const home = comp.competitors.find((c: any) => c.homeAway === "home");
  const away = comp.competitors.find((c: any) => c.homeAway === "away");
  if (!home || !away) return false;

  const hName =
    home.team && (home.team.displayName || home.team.shortDisplayName);
  const aName =
    away.team && (away.team.displayName || away.team.shortDisplayName);
  const fixtureTeam1 = stripPollutedTail(fixture.team1);
  const fixtureTeam2 = stripPollutedTail(fixture.team2);
  const pairFixture = teamsPairKey(fixtureTeam1, fixtureTeam2);
  const pairEspn = teamsPairKey(hName, aName);
  if (pairFixture !== pairEspn) return false;

  const kickoffFixture = matchKickoffUtcMs(fixture);
  const kickoffEspn = event.date ? new Date(event.date).getTime() : null;
  if (kickoffFixture == null || kickoffEspn == null) return true;
  return Math.abs(kickoffFixture - kickoffEspn) <= KICKOFF_MATCH_TOLERANCE_MS;
}

export function mapEspnEventsToScoreEntries(events: any, fixtures: any, matchKeyFn: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const fixture of fixtures || []) {
    const event = (events || []).find((e: any) => eventMatchesFixture(e, fixture));
    if (!event) continue;
    const raw = scoreEntryFromEspnEvent(event);
    const entry = orientEspnScore(raw, event, fixture);
    if (!entry) continue;
    const cleanFixture = isPollutedFixture(fixture)
      ? {
          ...fixture,
          team1: stripPollutedTail(fixture.team1),
          team2: stripPollutedTail(fixture.team2),
        }
      : fixture;
    out[matchKeyFn(cleanFixture)] = entry;
  }
  return out;
}

function isPollutedFixture(f: any): boolean {
  if (!f) return false;
  return (
    (f.team1 && /a\.e\.t\.|pen\.?\s*\d/i.test(f.team1)) ||
    (f.team2 && /a\.e\.t\.|pen\.?\s*\d/i.test(f.team2))
  );
}

export async function fetchScoresFromEspn(http: any, fixtures: any, matchKeyFn: any): Promise<Record<string, any>> {
  const dates = collectDateParams(fixtures);
  if (!dates) return {};

  try {
    const url = `${ESPN_SCOREBOARD_URL}?dates=${dates}`;
    const r = await http.get(url, { timeout: 12000 });
    if (!r || r.error || !r.body) {
      mainLog.warn("[worldcup/scores-api-espn] fetch failed", {
        error: r && r.error,
        status: r && r.status,
      });
      return {};
    }
    if (r.status && r.status >= 400) {
      mainLog.warn("[worldcup/scores-api-espn] bad status", {
        status: r.status,
      });
      return {};
    }
    const data = JSON.parse(r.body);
    const events = data && Array.isArray(data.events) ? data.events : [];
    return mapEspnEventsToScoreEntries(events, fixtures, matchKeyFn);
  } catch (err: any) {
    mainLog.warn("[worldcup/scores-api-espn] threw", {
      msg: err && err.message,
    });
    return {};
  }
}

module.exports = {
  ESPN_SCOREBOARD_URL,
  scoreEntryFromEspnEvent,
  scorersFromEspnEvent,
  mapEspnEventsToScoreEntries,
  fetchScoresFromEspn,
  eventMatchesFixture,
  deriveEtPenFromScorers,
};