/**
 * src/renderer/worldcup/match-utils.js
 *
 * 比赛键 / 开球时间 / 比分刷新筛选 (跟 main/match-key.js 对齐)
 */

export function parseUtcOffsetHours(tz) {
  if (!tz || typeof tz !== "string") return 0;
  const m = tz.match(/^UTC([+-])(\d{1,2})$/);
  if (!m) return 0;
  return m[1] === "+" ? -parseInt(m[2], 10) : parseInt(m[2], 10);
}

export function matchKey(match) {
  if (!match) return "";
  return `${match.date}|${match.time}|${match.team1}|${match.team2}`;
}

export function matchKickoffUtcMs(match) {
  if (!match || !match.date || !match.time) return null;
  const [y, mo, d] = match.date.split("-").map((n) => parseInt(n, 10));
  const [h, mi] = match.time.split(":").map((n) => parseInt(n, 10));
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

export function isScoreRefreshEligible(match, cachedEntry, nowMs = Date.now()) {
  const kickoff = matchKickoffUtcMs(match);
  if (kickoff == null || kickoff > nowMs) return false;
  if (cachedEntry && cachedEntry.status === "final") {
    const scorers = cachedEntry.scorers;
    if (Array.isArray(scorers) && scorers.length > 0) return false;
    return true;
  }
  return true;
}

export function isMatchUpcoming(match, nowMs = Date.now()) {
  const kickoff = matchKickoffUtcMs(match);
  if (kickoff == null) return false;
  if (
    match.score &&
    (match.score.status === "live" || match.score.status === "final")
  ) {
    return false;
  }
  return kickoff > nowMs;
}

export function applyScoreToMatch(match, scoreEntry) {
  if (!match || !scoreEntry || !scoreEntry.ft) return match;
  return {
    ...match,
    score: {
      ft: scoreEntry.ft,
      ht: scoreEntry.ht || undefined,
      status: scoreEntry.status || "final",
      clock: scoreEntry.clock || undefined,
      scorers: Array.isArray(scoreEntry.scorers)
        ? scoreEntry.scorers
        : undefined,
    },
  };
}

export function mergeScoresIntoMatches(matches, scoreMap) {
  if (!Array.isArray(matches) || !scoreMap) return matches;
  return matches.map((m) => {
    const entry = scoreMap[matchKey(m)];
    return entry ? applyScoreToMatch(m, entry) : m;
  });
}
