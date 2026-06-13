/**
 * src/main/worldcup/parser.js
 *
 * v2.9.0 世界杯专栏 — Football.TXT 解析器
 *
 * 解析 openfootball/worldcup 仓库的 TXT 格式 (示例见 spec §1):
 *
 *   = World Cup 2026
 *   Group A | Mexico   South Africa   South Korea   Czech Republic
 *   ...
 *
 *   ▪ Group A
 *   Thu June 11
 *     13:00 UTC-6  Mexico       v South Africa        @ Mexico City
 *     13:00 UTC-6  Mexico  2-0 (1-0)  South Africa    @ Mexico City  (已赛比分行)
 *
 *   ▪ Final
 *   Sun Jul 19
 *     15:00 UTC-4  W101 v W102    @ New York/New Jersey (East Rutherford)
 *
 * 输出:
 *   {
 *     name: "World Cup 2026",
 *     groups: [{ letter, teams }],
 *     matches: [{ stage, round, date, time, timezone, team1, team2, venue, score }]
 *   }
 *
 * 容错策略:
 *   - 未知行 skip (不抛)
 *   - 队名空 skip
 *   - date parse 失败 skip 该 match
 *   - 全空 group 数组 (TXT 没 group 行) 也 OK
 */

const STAGES = new Set([
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F",
  "Group G",
  "Group H",
  "Group I",
  "Group J",
  "Group K",
  "Group L",
  "Round of 16",
  "Round of 32",
  "Quarter-finals",
  "Quarter-final",
  "Semi-finals",
  "Semi-final",
  "Match for third place",
  "Third place",
  "Final",
]);

const MONTHS = {
  Jan: 1,
  January: 1,
  Feb: 2,
  February: 2,
  Mar: 3,
  March: 3,
  Apr: 4,
  April: 4,
  May: 5,
  Jun: 6,
  June: 6,
  Jul: 7,
  July: 7,
  Aug: 8,
  August: 8,
  Sep: 9,
  Sept: 9,
  September: 9,
  Oct: 10,
  October: 10,
  Nov: 11,
  November: 11,
  Dec: 12,
  December: 12,
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseScorePair(raw) {
  const m = String(raw || "").match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/**
 * 解析单行比赛: 支持 "A v B" 与 "A 2-0 (1-0) B" 两种 openfootball 格式
 * @param {string} line
 */
function parseMatchLine(line) {
  const head = line.match(/^(\d{1,2}:\d{2})(?:\s+(UTC[+\-]\d{1,2}))?\s+(.+)$/);
  if (!head) return null;

  const time = head[1];
  const timezone = head[2] || "";
  const body = head[3].trim();
  const atIdx = body.lastIndexOf("@");
  if (atIdx < 0) return null;

  const venue = body.slice(atIdx + 1).trim();
  const mid = body.slice(0, atIdx).trim();
  if (!venue || !mid) return null;

  const vFmt = mid.match(/^(.+?)\s+v\s+(.+)$/i);
  if (vFmt) {
    const team1 = vFmt[1].trim();
    const team2 = vFmt[2].trim();
    if (!team1 || !team2) return null;
    return { time, timezone, team1, team2, venue, score: null };
  }

  const scoreFmt = mid.match(/^(.+?)\s+(\d+-\d+)\s*(?:\((\d+-\d+)\))?\s+(.+)$/);
  if (scoreFmt) {
    const ft = parseScorePair(scoreFmt[2]);
    const team1 = scoreFmt[1].trim();
    const team2 = scoreFmt[4].trim();
    if (!ft || !team1 || !team2) return null;
    const ht = scoreFmt[3] ? parseScorePair(scoreFmt[3]) : undefined;
    return {
      time,
      timezone,
      team1,
      team2,
      venue,
      score: {
        ft,
        ht: ht || undefined,
        status: "final",
      },
    };
  }

  return null;
}

function isGroupStageHeader(rest) {
  return /^Group\s+[A-L]/i.test(rest);
}

function isKnockoutStageHeader(rest) {
  if (STAGES.has(rest)) return true;
  return /^(Round of|Quarter|Semi|Final|Third place|Match for third)/i.test(
    rest,
  );
}

/**
 * @param {string} txt
 * @returns {{name: string, groups: Array<{letter: string, teams: string[]}>, matches: Array}}
 */
function parseWorldcupTxt(txt) {
  if (typeof txt !== "string" || txt.length === 0) {
    throw new Error("empty_input");
  }

  const lines = txt.split(/\r?\n/);
  const groups = [];
  const matches = [];

  let name = "World Cup";
  let currentStage = null;
  let currentDate = null; // 'YYYY-MM-DD'
  let currentWeekday = null; // 'Sun'..'Sat'

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    // Title: '= World Cup 2026      # in Canada, USA, and Mexico'
    // 截 # 注释
    if (line.startsWith("=")) {
      const stripped = line.replace(/^=\s*/, "").split("#")[0].trim();
      if (stripped) name = stripped;
      continue;
    }

    // Group definition: 'Group A | Mexico   South Africa   ...'
    const groupMatch = line.match(/^Group\s+([A-Z])\s*\|\s*(.+)$/i);
    if (groupMatch) {
      const letter = groupMatch[1].toUpperCase();
      const teamsRaw = groupMatch[2]
        .split(/\s{2,}|\s+\|\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (teamsRaw.length > 0) {
        groups.push({ letter, teams: teamsRaw });
      }
      continue;
    }

    // Stage header: '▪ Group A' / '▪ Final' (忽略 Matchday 行)
    if (line.startsWith("▪")) {
      const rest = line.replace(/^▪\s*/, "").trim();
      if (isGroupStageHeader(rest) || isKnockoutStageHeader(rest)) {
        currentStage = rest;
        currentDate = null;
        currentWeekday = null;
      }
      continue;
    }

    // Weekday + date: 'Thu June 11' / 'Sun Jul 19'
    const dayMatch = line.match(
      /^([A-Z][a-z]{2,8})\s+([A-Za-z]+)\s+(\d{1,2})$/,
    );
    if (dayMatch) {
      const wd = dayMatch[1];
      const monStr = dayMatch[2];
      const dayNum = parseInt(dayMatch[3], 10);
      const month = MONTHS[monStr];
      if (month) {
        // Year: 2026 (TXT 头部确定, 这里默认 2026)
        currentDate = `2026-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        currentWeekday = wd;
      }
      continue;
    }

    const parsed = parseMatchLine(line);
    if (parsed && currentStage && currentDate) {
      const stage = isGroupStageHeader(currentStage)
        ? currentStage.match(/^Group\s+([A-L])/i)[0]
        : currentStage;
      matches.push({
        stage,
        round: null,
        date: currentDate,
        time: parsed.time,
        timezone: parsed.timezone,
        team1: parsed.team1,
        team2: parsed.team2,
        venue: parsed.venue,
        score: parsed.score,
        weekday: currentWeekday,
      });
    }
  }

  // 按 date 排序
  matches.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || "").localeCompare(b.time || "");
  });

  return { name, groups, matches };
}

/**
 * Group matches by date for WorldcupView.
 *
 * @param {Array} matches
 * @returns {Array<{date: string, weekday: string, matches: Array}>}
 */
function groupMatchesByDate(matches) {
  const map = new Map();
  for (const m of matches || []) {
    if (!m.date) continue;
    if (!map.has(m.date)) {
      map.set(m.date, { date: m.date, weekday: m.weekday || "", matches: [] });
    }
    map.get(m.date).matches.push(m);
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

module.exports = {
  parseWorldcupTxt,
  parseMatchLine,
  groupMatchesByDate,
  STAGES,
};
