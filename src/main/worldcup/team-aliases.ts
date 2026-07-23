/**
 * src/main/worldcup/team-aliases.ts
 *
 * 队名归一化: openfootball TXT / teams-data / worldcup26.ir 对齐
 */
"use strict";

const ALIASES: Record<string, string> = {
  "south korea": "korea republic",
  "korea republic": "korea republic",
  "united states": "usa",
  usa: "usa",
  "bosnia and herzegovina": "bosnia herzegovina",
  "bosnia & herzegovina": "bosnia herzegovina",
  "ivory coast": "cote divoire",
  "cote d'ivoire": "cote divoire",
  "cote d ivoire": "cote divoire",
  "cote divoire": "cote divoire",
  "czech republic": "czechia",
  czechia: "czechia",
  turkey: "turkiye",
  turkiye: "turkiye",
  "cape verde": "cabo verde",
  "cabo verde": "cabo verde",
  "dr congo": "congo dr",
  "congo dr": "congo dr",
  "d.r. congo": "congo dr",
  iran: "ir iran",
  "ir iran": "ir iran",
  curacao: "curacao",
  "cura\u00e7ao": "curacao",
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function canonicalTeamName(name: any): string {
  if (!name || typeof name !== "string") return "";
  let s = stripDiacritics(name).toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/[''\u00b4`]/g, " ");
  s = s
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[s] || s;
}

export function teamsPairKey(teamA: any, teamB: any): string {
  const pair = [canonicalTeamName(teamA), canonicalTeamName(teamB)].sort();
  return pair.join("|");
}

export function fixtureLookupKey(match: any): string {
  if (!match || !match.date || !match.time) return "";
  const time = normalizeTime(match.time);
  return `${match.date}|${time}|${teamsPairKey(match.team1, match.team2)}`;
}

export function normalizeTime(time: any): string {
  const [h, m] = String(time).split(":");
  if (h == null || m == null) return "";
  return `${String(h).padStart(2, "0")}:${m}`;
}

export function parseLocalDate(localDate: any): { date: string; time: string } | null {
  const m = String(localDate || "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2})/);
  if (!m) return null;
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  return {
    date: `${m[3]}-${mm}-${dd}`,
    time: normalizeTime(m[4]),
  };
}

export function gameLookupKey(game: any): string {
  const when = parseLocalDate(game && game.local_date);
  if (!when) return "";
  return `${when.date}|${when.time}|${teamsPairKey(game.home_team_name_en, game.away_team_name_en)}`;
}

module.exports = {
  canonicalTeamName,
  teamsPairKey,
  fixtureLookupKey,
  gameLookupKey,
  parseLocalDate,
  normalizeTime,
};