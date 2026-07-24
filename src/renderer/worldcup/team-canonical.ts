/**
 * src/renderer/worldcup/team-canonical.js
 *
 * 队名归一化 (与 main/worldcup/team-aliases.js 对齐)
 */

const ALIASES = {
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
  curaçao: "curacao",
};

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function canonicalTeamName(name) {
  if (!name || typeof name !== "string") return "";
  let s = stripDiacritics(name).toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/[''´`]/g, " ");
  s = s
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[s] || s;
}
