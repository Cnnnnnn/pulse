/**
 * src/renderer/worldcup/teams-data.js
 *
 * v2.9.2 (Squad Skeleton) — 50 队静态数据
 *
 * 数据来源:
 *   - 队名 (英文): openfootball/worldcup 2026 TXT 头部 group 行
 *   - 中文译名: FIFA 官方 / 体育媒体常用译
 *   - 国旗 emoji: Unicode regional indicator 拼接 (0 网络)
 *   - 1 真实人: FIFA 2026 报名预热 (各队知名队长 / 核心球员)
 *   - 25 占位 (TBD-1 ~ TBD-25): 用户后续可填, 阵型 4-3-3 / 4-2-3-1 等
 *
 * 拍 squad_skeleton: 不采 1 完整人, 只 1 真实 + 25 占位.
 * 后期 (v2.9.5+) 逐队填完, 见 src/renderer/worldcup/teams-data.notes.
 *
 * 形态:
 *   teams: {
 *     [fifaName]: {
 *       name: 'Mexico',
 *       cn: '墨西哥',
 *       code: 'MX',
 *       group: 'A',
 *       famous: [{ number, position, name, club }]   // 1 真实人
 *       squad: [TBD-1, TBD-2, ..., TBD-25]
 *     },
 *     ...
 *   }
 *
 * data integrity: 队名必须跟 openfootball TXT 的 Group 行 1:1, 中文译名 跟 FIFA 官方对齐.
 */

import { SQUADS } from "./squads-data.js";
import { attachSquadCn } from "./player-cn.js";
import { canonicalTeamName } from "./team-canonical.js";

// 50 队 数据 (12 组 × 4 队 + 2 邀请 = 50). 注: 2026 决赛圈实际 48 队, 邀请 2 队
// 由 FIFA 2026 跟 USL 拍板. 这里 hardcode 50 跟 TXT 头部 Group 行 1:1.
//
// 中文译名: 参照 FIFA 中文官网 / 新华体育 / 央视体育常用译
// 国旗 emoji: Unicode regional indicator (RI) 拼接
// 1 真实人: 选知名队长 / 核心球员

const TEAMS_RAW = [
  // ─── Group A ─────────────────────────────
  {
    name: "Mexico",
    cn: "墨西哥",
    code: "MX",
    group: "A",
    famous: { number: 10, position: "FW", name: "Hirving Lozano", club: "PSV" },
  },
  {
    name: "South Africa",
    cn: "南非",
    code: "ZA",
    group: "A",
    famous: { number: 10, position: "FW", name: "Percy Tau", club: "Al Ahly" },
  },
  {
    name: "Korea Republic",
    cn: "韩国",
    code: "KR",
    group: "A",
    famous: {
      number: 7,
      position: "FW",
      name: "Son Heung-min",
      club: "Tottenham",
    },
  },
  {
    name: "Czechia",
    cn: "捷克",
    code: "CZ",
    group: "A",
    famous: {
      number: 7,
      position: "MF",
      name: "Tomáš Souček",
      club: "West Ham",
    },
  },

  // ─── Group B ─────────────────────────────
  {
    name: "Canada",
    cn: "加拿大",
    code: "CA",
    group: "B",
    famous: {
      number: 10,
      position: "FW",
      name: "Alphonso Davies",
      club: "Bayern",
    },
  },
  {
    name: "Bosnia & Herzegovina",
    cn: "波黑",
    code: "BA",
    group: "B",
    famous: {
      number: 10,
      position: "MF",
      name: "Edin Džeko",
      club: "Fenerbahçe",
    },
  },
  {
    name: "Qatar",
    cn: "卡塔尔",
    code: "QA",
    group: "B",
    famous: {
      number: 10,
      position: "FW",
      name: "Almoez Ali",
      club: "Al-Rayyan",
    },
  },
  {
    name: "Switzerland",
    cn: "瑞士",
    code: "CH",
    group: "B",
    famous: {
      number: 10,
      position: "MF",
      name: "Granit Xhaka",
      club: "Leverkusen",
    },
  },

  // ─── Group C ─────────────────────────────
  {
    name: "Brazil",
    cn: "巴西",
    code: "BR",
    group: "C",
    famous: {
      number: 10,
      position: "FW",
      name: "Vinícius Júnior",
      club: "Real Madrid",
    },
  },
  {
    name: "Morocco",
    cn: "摩洛哥",
    code: "MA",
    group: "C",
    famous: {
      number: 8,
      position: "MF",
      name: "Aziz Bouhaddouz",
      club: "Al-Duhail",
    },
  },
  {
    name: "Haiti",
    cn: "海地",
    code: "HT",
    group: "C",
    famous: {
      number: 10,
      position: "FW",
      name: "Duckens Nazon",
      club: "Saint-Étienne",
    },
  },
  {
    name: "Scotland",
    cn: "苏格兰",
    code: "GB",
    group: "C",
    famous: {
      number: 7,
      position: "MF",
      name: "John McGinn",
      club: "Aston Villa",
    },
  },

  // ─── Group D ─────────────────────────────
  {
    name: "USA",
    cn: "美国",
    code: "US",
    group: "D",
    famous: {
      number: 10,
      position: "FW",
      name: "Christian Pulisic",
      club: "AC Milan",
    },
  },
  {
    name: "Paraguay",
    cn: "巴拉圭",
    code: "PY",
    group: "D",
    famous: {
      number: 10,
      position: "MF",
      name: "Miguel Almirón",
      club: "Newcastle",
    },
  },
  {
    name: "Australia",
    cn: "澳大利亚",
    code: "AU",
    group: "D",
    famous: {
      number: 7,
      position: "FW",
      name: "Mathew Leckie",
      club: "Melbourne City",
    },
  },
  {
    name: "Türkiye",
    cn: "土耳其",
    code: "TR",
    group: "D",
    famous: { number: 9, position: "FW", name: "Cenk Tosun", club: "Beşiktaş" },
  },

  // ─── Group E ─────────────────────────────
  {
    name: "Germany",
    cn: "德国",
    code: "DE",
    group: "E",
    famous: {
      number: 7,
      position: "MF",
      name: "Florian Wirtz",
      club: "Leverkusen",
    },
  },
  {
    name: "Curaçao",
    cn: "库拉索",
    code: "CW",
    group: "E",
    famous: {
      number: 10,
      position: "FW",
      name: "Leandro Bacuna",
      club: "Karagümrük",
    },
  },
  {
    name: "Côte d'Ivoire",
    cn: "科特迪瓦",
    code: "CI",
    group: "E",
    famous: {
      number: 10,
      position: "FW",
      name: "Sébastien Haller",
      club: "Leganés",
    },
  },
  {
    name: "Ecuador",
    cn: "厄瓜多尔",
    code: "EC",
    group: "E",
    famous: {
      number: 10,
      position: "FW",
      name: "Enner Valencia",
      club: "Pachuca",
    },
  },

  // ─── Group F ─────────────────────────────
  {
    name: "Netherlands",
    cn: "荷兰",
    code: "NL",
    group: "F",
    famous: {
      number: 9,
      position: "FW",
      name: "Cody Gakpo",
      club: "Liverpool",
    },
  },
  {
    name: "Japan",
    cn: "日本",
    code: "JP",
    group: "F",
    famous: {
      number: 15,
      position: "FW",
      name: "Kaoru Mitoma",
      club: "Brighton",
    },
  },
  {
    name: "Sweden",
    cn: "瑞典",
    code: "SE",
    group: "F",
    famous: {
      number: 10,
      position: "FW",
      name: "Alexander Isak",
      club: "Newcastle",
    },
  },
  {
    name: "Tunisia",
    cn: "突尼斯",
    code: "TN",
    group: "F",
    famous: {
      number: 7,
      position: "FW",
      name: "Youssef Msakni",
      club: "Al-Arabi",
    },
  },

  // ─── Group G ─────────────────────────────
  {
    name: "Belgium",
    cn: "比利时",
    code: "BE",
    group: "G",
    famous: {
      number: 7,
      position: "FW",
      name: "Kevin De Bruyne",
      club: "Man City",
    },
  },
  {
    name: "Egypt",
    cn: "埃及",
    code: "EG",
    group: "G",
    famous: {
      number: 10,
      position: "FW",
      name: "Mohamed Salah",
      club: "Liverpool",
    },
  },
  {
    name: "IR Iran",
    cn: "伊朗",
    code: "IR",
    group: "G",
    famous: { number: 7, position: "MF", name: "Sardar Azmoun", club: "Roma" },
  },
  {
    name: "New Zealand",
    cn: "新西兰",
    code: "NZ",
    group: "G",
    famous: {
      number: 10,
      position: "FW",
      name: "Chris Wood",
      club: "Nottingham Forest",
    },
  },

  // ─── Group H ─────────────────────────────
  {
    name: "Spain",
    cn: "西班牙",
    code: "ES",
    group: "H",
    famous: { number: 8, position: "MF", name: "Pedri", club: "Barcelona" },
  },
  {
    name: "Cabo Verde",
    cn: "佛得角",
    code: "CV",
    group: "H",
    famous: {
      number: 10,
      position: "FW",
      name: "Garry Rodrigues",
      club: "Al-Ahli",
    },
  },
  {
    // ponytail: TXT 给 "Ivory Coast" (canonicalTeamName → "cote divoire"),
    // 但 TEAMS 实际 key 是 "Côte d'Ivoire" (FIFA 官方名). alias 链靠这个 key 兜底.
    name: "Côte d'Ivoire",
    cn: "科特迪瓦",
    code: "CI",
    group: "E",
    famous: {
      number: 10,
      position: "FW",
      name: "Nicolas Pépé",
      club: "Trabzonspor",
    },
  },
  {
    name: "Saudi Arabia",
    cn: "沙特",
    code: "SA",
    group: "H",
    famous: {
      number: 10,
      position: "FW",
      name: "Salem Al-Dawsari",
      club: "Al-Hilal",
    },
  },
  {
    name: "Uruguay",
    cn: "乌拉圭",
    code: "UY",
    group: "H",
    famous: {
      number: 9,
      position: "FW",
      name: "Luis Suárez",
      club: "Inter Miami",
    },
  },

  // ─── Group I ─────────────────────────────
  {
    name: "France",
    cn: "法国",
    code: "FR",
    group: "I",
    famous: {
      number: 10,
      position: "FW",
      name: "Kylian Mbappé",
      club: "Real Madrid",
    },
  },
  {
    name: "Senegal",
    cn: "塞内加尔",
    code: "SN",
    group: "I",
    famous: { number: 9, position: "FW", name: "Sadio Mané", club: "Al-Nassr" },
  },
  {
    name: "Iraq",
    cn: "伊拉克",
    code: "IQ",
    group: "I",
    famous: {
      number: 10,
      position: "MF",
      name: "Alaa Abbas",
      club: "Al-Quwa Al-Jawiya",
    },
  },
  {
    name: "Norway",
    cn: "挪威",
    code: "NO",
    group: "I",
    famous: {
      number: 7,
      position: "FW",
      name: "Erling Haaland",
      club: "Man City",
    },
  },

  // ─── Group J ─────────────────────────────
  {
    name: "Argentina",
    cn: "阿根廷",
    code: "AR",
    group: "J",
    famous: {
      number: 10,
      position: "FW",
      name: "Lionel Messi",
      club: "Inter Miami",
    },
  },
  {
    name: "Algeria",
    cn: "阿尔及利亚",
    code: "DZ",
    group: "J",
    famous: {
      number: 7,
      position: "FW",
      name: "Riyad Mahrez",
      club: "Al-Ahli",
    },
  },
  {
    name: "Austria",
    cn: "奥地利",
    code: "AT",
    group: "J",
    famous: {
      number: 9,
      position: "FW",
      name: "Marko Arnautović",
      club: "Inter Milan",
    },
  },
  {
    name: "Jordan",
    cn: "约旦",
    code: "JO",
    group: "J",
    famous: {
      number: 7,
      position: "FW",
      name: "Musa Al-Tamari",
      club: "Monaco",
    },
  },

  // ─── Group K ─────────────────────────────
  {
    name: "Portugal",
    cn: "葡萄牙",
    code: "PT",
    group: "K",
    famous: {
      number: 7,
      position: "FW",
      name: "Cristiano Ronaldo",
      club: "Al-Nassr",
    },
  },
  {
    name: "Congo DR",
    cn: "刚果(金)",
    code: "CD",
    group: "K",
    famous: {
      number: 9,
      position: "FW",
      name: "Cédric Bakambu",
      club: "Al-Ettifaq",
    },
  },
  {
    name: "Uzbekistan",
    cn: "乌兹别克",
    code: "UZ",
    group: "K",
    famous: {
      number: 10,
      position: "MF",
      name: "Jaloliddin Masharipov",
      club: "Persija",
    },
  },
  {
    name: "Colombia",
    cn: "哥伦比亚",
    code: "CO",
    group: "K",
    famous: {
      number: 10,
      position: "FW",
      name: "Luis Díaz",
      club: "Liverpool",
    },
  },

  // ─── Group L ─────────────────────────────
  {
    name: "England",
    cn: "英格兰",
    code: "GB",
    group: "L",
    famous: {
      number: 10,
      position: "FW",
      name: "Jude Bellingham",
      club: "Real Madrid",
    },
  },
  {
    name: "Croatia",
    cn: "克罗地亚",
    code: "HR",
    group: "L",
    famous: {
      number: 10,
      position: "MF",
      name: "Luka Modrić",
      club: "Real Madrid",
    },
  },
  {
    name: "Ghana",
    cn: "加纳",
    code: "GH",
    group: "L",
    famous: {
      number: 9,
      position: "FW",
      name: "Mohammed Kudus",
      club: "West Ham",
    },
  },
  {
    name: "Panama",
    cn: "巴拿马",
    code: "PA",
    group: "L",
    famous: {
      number: 10,
      position: "MF",
      name: "Edgar Bárcenas",
      club: "Mazatlán",
    },
  },
];

// ISO alpha-2 队旗 code（UI 用 TeamFlag SVG 渲染，非 emoji）
function flagFromCode(code) {
  if (!code || typeof code !== 'string' || code.length !== 2) return null;
  return code.toUpperCase();
}

// 26 人占位骨架 (FIFA 报名未填时 fallback)
function makeSquadSkeleton() {
  const list = [];
  for (let i = 1; i <= 26; i += 1) {
    list.push({ number: i, position: "TBD", name: `TBD-${i}`, club: "TBD" });
  }
  return list;
}

// 导出
const TEAMS = {};
for (const t of TEAMS_RAW) {
  TEAMS[t.name] = {
    name: t.name,
    cn: t.cn,
    code: t.code,
    group: t.group,
    flag: flagFromCode(t.code),
    famous: [t.famous],
    squad: attachSquadCn(SQUADS[t.name] || makeSquadSkeleton()),
  };
}

/** canonical 名 → teams-data 官方 key (South Korea → Korea Republic 等) */
const CANONICAL_TEAM_KEY = {};
for (const name of Object.keys(TEAMS)) {
  CANONICAL_TEAM_KEY[canonicalTeamName(name)] = name;
}

function teamEntry(t) {
  return {
    name: t.name,
    cn: t.cn,
    flag: t.flag,
    code: t.code,
    group: t.group,
    squad: t.squad,
    famous: t.famous,
  };
}

/**
 * 给定 match.team1 / match.team2 (英文, 含 TXT 别名), 返 中文 + flag
 * @param {string} enName
 * @returns {{ name: string, cn: string, flag: string, code: string, group: string, squad: Array, famous: Array }|null}
 */
function lookupTeam(enName) {
  if (!enName) return null;
  const direct = TEAMS[enName];
  if (direct) return teamEntry(direct);

  const key = CANONICAL_TEAM_KEY[canonicalTeamName(enName)];
  if (key && TEAMS[key]) return teamEntry(TEAMS[key]);

  return null;
}

/**
 * UI 展示用: 始终返回中文名 + 队旗 code（未知队回退英文名 + null code）
 * @param {string} enName
 */
function displayTeam(enName) {
  const t = lookupTeam(enName);
  return {
    officialName: t ? t.name : enName,
    cn: t ? t.cn : enName,
    flag: t ? t.code : null,
    group: t ? t.group : null,
    found: Boolean(t),
  };
}

/**
 * 列出所有队, 按 group 排序
 * @returns {Array}
 */
function listTeams() {
  return Object.values(TEAMS).sort((a, b) => {
    if (a.group !== b.group) return a.group < b.group ? -1 : 1;
    return a.name < b.name ? -1 : 1;
  });
}

export { TEAMS, listTeams, lookupTeam, displayTeam, flagFromCode };
