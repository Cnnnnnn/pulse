/**
 * src/main/worldcup/match-key.ts
 *
 * 比赛唯一键 + 开球 UTC 时间 (比分刷新筛选用)
 */
"use strict";

function parseUtcOffsetHours(tz: any): number {
  if (!tz || typeof tz !== "string") return 0;
  const m = tz.match(/^UTC([+-])(\d{1,2})$/);
  if (!m) return 0;
  return m[1] === "+" ? -parseInt(m[2], 10) : parseInt(m[2], 10);
}

export function matchKey(match: any): string {
  if (!match) return "";
  return `${match.date || ""}|${match.time || ""}|${match.team1 || ""}|${match.team2 || ""}`;
}

export function matchKickoffUtcMs(match: any): number | null {
  if (!match || !match.date || !match.time) return null;
  const [y, mo, d] = match.date.split("-").map((n: string) => parseInt(n, 10));
  const [h, mi] = match.time.split(":").map((n: string) => parseInt(n, 10));
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;

  const offsetH = parseUtcOffsetHours(match.timezone || "");
  let utcH = h + offsetH;
  let day = d;
  let month = mo;
  let year = y;
  while (utcH >= 24) {
    utcH -= 24;
    day += 1;
  }
  while (utcH < 0) {
    utcH += 24;
    day -= 1;
  }
  return Date.UTC(year, month - 1, day, utcH, mi, 0);
}

export function isScoreRefreshEligible(match: any, cachedEntry: any, nowMs: number = Date.now()): boolean {
  const kickoff = matchKickoffUtcMs(match);
  if (kickoff == null || kickoff > nowMs) return false;
  if (cachedEntry && cachedEntry.status === "final") {
    const scorers = cachedEntry.scorers;
    if (Array.isArray(scorers) && scorers.length > 0) return false;
    return true;
  }
  return true;
}

export function isMatchStarted(match: any, nowMs: number = Date.now()): boolean {
  const kickoff = matchKickoffUtcMs(match);
  return kickoff != null && kickoff <= nowMs;
}

module.exports = {
  matchKey,
  matchKickoffUtcMs,
  isScoreRefreshEligible,
  isMatchStarted,
  parseUtcOffsetHours,
};