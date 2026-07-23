/**
 * src/main/worldcup/scores-api-espn.js
 *
 * 第三层比分源 (实时优先): ESPN site API — soccer/fifa.world/scoreboard
 * 无需 API key; Electron 主进程拉取无 CORS 问题.
 */

const { canonicalTeamName, teamsPairKey } = require("./team-aliases");
const { matchKickoffUtcMs } = require("./match-key");
const { mainLog } = require("../log.ts");

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const KICKOFF_MATCH_TOLERANCE_MS = 3 * 60 * 60 * 1000;

function yyyymmddFromUtcMs(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function collectDateParams(fixtures) {
  const set = new Set();
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

function scoreEntryFromEspnEvent(event) {
  if (!event || !event.competitions || !event.competitions[0]) return null;
  const comp = event.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
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

  // ponytail: 单 attempt 算 et/pen 不够 (没 fixture 不知道 teamSide 跟 ft 怎么对齐)。
  // 这里只把 event 字段留给上层 orientEspnScore 调用 deriveEtPenFromScorers。
  return {
    ft: [homeScore, awayScore],
    ht: null,
    status,
    clock,
    updatedAt: Date.now(),
    source: "espn",
  };
}

function _teamId(competitor) {
  if (!competitor) return null;
  if (competitor.team && competitor.team.id != null)
    return String(competitor.team.id);
  if (competitor.id != null) return String(competitor.id);
  return null;
}

function _fixtureTeamSideForEspnHome(homeName, fixture) {
  const t1 = canonicalTeamName(fixture.team1);
  const t2 = canonicalTeamName(fixture.team2);
  const eh = canonicalTeamName(homeName);
  if (eh === t1) return { home: "team1", away: "team2" };
  if (eh === t2) return { home: "team2", away: "team1" };
  return null;
}

/**
 * ponytail: 加时 (et) 和点球大战 (pen) 比分从 scorers 反推.
 *
 * 规则 (跟 scorer-leaderboard 的 isShootoutGoal 完全对称):
 *   - shootout (点球大战) 进球: minute 是纯 "120'" (不跟加时补时 "+N" 形式混淆).
 *     同理 Yellow Card 在 "120'" 黄牌也表明本场进了 shootout — 但只对进球统计比分.
 *   - 加时常规进球: minute 在 91'..120'+N (含 Penalty - Scored). 但 minute 是纯
 *     "120'" → shootout, 不算 et. 所以 etScore 只计 minute 含 "+" 后缀的进球.
 *
 * 入参 scorers 必须是已 orient (teamSide=team1/team2 跟 fixture 对齐) 的格式.
 * 无任何 shootout 进球 → pen = null (光 90 分决出就置 null,别乱标 "点球 0:0").
 * 有 shootout → pen = [team1ShootoutGoals, team2ShootoutGoals], et = 加时常规进球.
 *
 * @param {Array} scorers - orient 后的 scorers 数组
 * @returns {{et: [number, number] | null, pen: [number, number] | null}}
 */
function deriveEtPenFromScorers(scorers) {
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
    // ponytail: shootout 形式是精确 "120'", ET 末刻进球是 "120'+X'", ET 中段是 "91'".."119'".
    // minute === "120'" → shootout (不进 et)。任何 "91'".."120'+X" 都算 et (含 ET Point Penalty)。
    if (minute === "120'") {
      // shootout 形式:精确 "120'" (无 +N 后缀)
      hasShootout = true;
      if (s.teamSide === "team1") t1Pen++;
      else if (s.teamSide === "team2") t2Pen++;
      continue;
    }
    // 加时段 (91'..120'+N): "数字' [+数字]?" 形式,末尾可能有引号或不 (ESPN 不一致).
    // examples: "91'", "105'+1'", "120'+5'"
    const etMatch = minute.match(/^(\d{2,3})'(?:\+(\d+))?'?$/);
    if (!etMatch) continue;
    const base = parseInt(etMatch[1], 10);
    if (base >= 91 && base <= 120) {
      hasEtGoal = true;
      // ponytail: 2026-07-07 — OG 也要算 et. 之前 `if (s.ownGoal) continue` 跳了
      // OG, M86 Borges 111' OG 算阿根廷 +1 (FIFA 规则: 进球归对方 = Argentina),
      // 跳过 → 显示 1:1 错, 应 2:1. ESPN data 里 OG 的 d.team.id 是进球方/胜利方
      // (Argentina), 跟正常进球 teamSide 一致, 不需翻转.
      if (s.teamSide === "team1") t1Et++;
      else if (s.teamSide === "team2") t2Et++;
    }
  }
  return {
    et: hasEtGoal ? [t1Et, t2Et] : null,
    pen: hasShootout ? [t1Pen, t2Pen] : null,
  };
}

function scorersFromEspnEvent(event, fixture) {
  if (!event || !fixture) return [];
  const comp = event.competitions && event.competitions[0];
  if (!comp) return [];
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return [];

  const hName =
    home.team && (home.team.displayName || home.team.shortDisplayName);
  const sideMap = _fixtureTeamSideForEspnHome(hName, fixture);
  if (!sideMap) return [];

  const homeId = _teamId(home);
  const awayId = _teamId(away);
  const out = [];

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

function orientEspnScore(entry, event, fixture) {
  if (!entry || !event || !fixture) return null;
  const comp = event.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const hName =
    home.team && (home.team.displayName || home.team.shortDisplayName);
  const aName =
    away.team && (away.team.displayName || away.team.shortDisplayName);
  // v2.74.3: bracket fixture.team1/2 可能是污染串 — strip 后再 canonical.
  // canonicalTeamName 把 "a.e.t. (...) Paraguay" 转成 "a e t 1 1 0 1 3 4 pen paraguay"
  // 跟 espn "paraguay" 对不上, orient 就退出 (返回 null). 先 strip 抽真队名.
  const fixtureTeam1Clean = stripPollutedTail(fixture.team1);
  const fixtureTeam2Clean = stripPollutedTail(fixture.team2);
  const t1 = canonicalTeamName(fixtureTeam1Clean);
  const t2 = canonicalTeamName(fixtureTeam2Clean);
  const eh = canonicalTeamName(hName);
  const ea = canonicalTeamName(aName);

  const scorers = scorersFromEspnEvent(event, fixture);

  // ponytail: 从 scorers 自动推算 et/pen. 优于 hardcoded 表: API 一次拿, 任何比赛都适用。
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

/**
 * v2.74.3: cup_finals.txt 里 M74/M75 的 team2 被污染成
 * "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay". teamsPairKey 把整段当作字面 key
 * (含 "a e t 1 1 0 1 3 4 pen paraguay") — 跟 ESPN 返回的 clean "Paraguay" 对不上.
 *
 * 抽真正队名: 取最后一段以 [A-Z] 开头的连续词组当作队名 (队名首字母总大写).
 * 干净字符串原样返回.
 *
 * ponytail: 跟 bracket.js 的 cleanPollutedTeamName 重复实现, 因为 cross-file
 * require 会引入循环依赖风险. 注释里互相 reference 即可.
 */
function stripPollutedTail(name) {
  if (typeof name !== "string") return name;
  if (!/a\.e\.t\.|pen\.?\s*\d/i.test(name)) return name;
  const matches = name.match(/[A-Z][a-zA-ZÀ-ÿ' .-]+(?=$)/g);
  if (matches && matches.length > 0) return matches[matches.length - 1].trim();
  return name;
}

function eventMatchesFixture(event, fixture) {
  if (!event || !fixture) return false;
  const comp = event.competitions && event.competitions[0];
  if (!comp) return false;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return false;

  const hName =
    home.team && (home.team.displayName || home.team.shortDisplayName);
  const aName =
    away.team && (away.team.displayName || away.team.shortDisplayName);
  // v2.74.3: bracket fixture 可能是污染串 (cup_finals.txt 历史 bug). strip 后再
  // 算 pairKey 才对得上 ESPN clean 名字.
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

function mapEspnEventsToScoreEntries(events, fixtures, matchKeyFn) {
  const out = {};
  for (const fixture of fixtures || []) {
    const event = (events || []).find((e) => eventMatchesFixture(e, fixture));
    if (!event) continue;
    const raw = scoreEntryFromEspnEvent(event);
    const entry = orientEspnScore(raw, event, fixture);
    if (!entry) continue;
    // v2.74.3: matchKeyFn 默认用 fixture.team1/team2 (污染串). 为了让后续
    // mergeLiveScoresIntoSnapshot 用相同的 clean name 算出相同 key, 这里临时
    // 把 fixture.team1/team2 替换成 clean, 再调 matchKeyFn.
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

function isPollutedFixture(f) {
  if (!f) return false;
  return (
    (f.team1 && /a\.e\.t\.|pen\.?\s*\d/i.test(f.team1)) ||
    (f.team2 && /a\.e\.t\.|pen\.?\s*\d/i.test(f.team2))
  );
}

async function fetchScoresFromEspn(http, fixtures, matchKeyFn) {
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
  } catch (err) {
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
