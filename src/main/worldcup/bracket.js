/**
 * src/main/worldcup/bracket.js
 *
 * IPC handler for worldcup bracket computation.
 *
 * 复用现有 fetcher / parser / scores-fetcher / state-store,
 * 调 bracket-rules.computeBracket 算 bracket, 写入 state.json.worldcup_bracket_snapshot.
 *
 * v1.3: 同时拉 cup_finals.txt, 按 matchNum 把开球时间 + 场地 + 已确定队伍
 *       merge 到 snapshot 每个 match 上 (kickoff 字段 + slot.team.name 覆盖).
 *
 * Test 注入点: fetcher / finalsFetcher / scores / teamsData 都是 opts, 默认走真实模块.
 */

"use strict";

const stateStore = require("../state-store");
const { computeBracket } = require("./bracket-rules");
const { mainLog } = require("../log");
const { fetchWorldcupFixtures, loadFinalsTxt } = require("./fetcher");
const { teamsPairKey, canonicalTeamName } = require("./team-aliases");
const { matchKickoffUtcMs } = require("./match-key");

/**
 * Compute full bracket from current group standings + scores.
 *
 * @param {object} [opts]
 * @param {string} [opts.statePath] - injected for tests
 * @param {Function} [opts.fetcher] - injected for tests; defaults to fetchWorldcupFixtures
 * @param {Function} [opts.finalsFetcher] - injected for tests; defaults to loadFinalsTxt
 * @param {Function} [opts.scores] - injected for tests; defaults to () => stateStore.loadWorldcupScores()
 * @param {Function} [opts.teamsData] - injected for tests
 * @param {object} [opts.groupStandings] - injected for tests; bypasses fetcher/parser path
 * @param {Array}  [opts.finalsMatches] - injected for tests; bypasses finals fetcher
 * @returns {Promise<{ok: boolean, snapshot?: object, reason?: string, error?: string}>}
 */
async function computeWorldcupBracket(opts = {}) {
  try {
    const fetcher = opts.fetcher;
    let fixturesR = null;
    if (fetcher) {
      fixturesR = await fetcher();
    } else {
      fixturesR = await fetchWorldcupFixtures({});
    }
    if (!fixturesR || !fixturesR.ok) {
      return {
        ok: false,
        reason: fixturesR ? fixturesR.reason : "fetch_failed",
      };
    }

    const data = fixturesR.data || {};
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const groups = Array.isArray(data.groups) ? data.groups : [];

    const teamsData = opts.teamsData ? opts.teamsData() : groups;
    const scores = opts.scores ? opts.scores() : loadScoresFromState();

    const groupStandings =
      opts.groupStandings || extractGroupStandings(matches, teamsData);
    const snapshot = computeBracket({ groupStandings, scores });

    if (!snapshot) {
      return { ok: false, reason: "no_group_data" };
    }

    // v1.3: 拉 cup_finals.txt 把开球时间 / 场地 / 已确定队伍 merge 到 snapshot.
    // 失败不阻塞 bracket 计算 (warnings 里记一下即可).
    let finalsMatches = opts.finalsMatches;
    let finalsFetchWarning = null;
    if (!Array.isArray(finalsMatches)) {
      try {
        const finalsFetcher = opts.finalsFetcher || loadFinalsTxt;
        const finalsR = await finalsFetcher();
        if (finalsR && finalsR.ok && finalsR.txt) {
          const { parseWorldcupTxt } = require("./parser");
          const finalsData = parseWorldcupTxt(finalsR.txt);
          finalsMatches = finalsData.matches || [];
        } else {
          finalsFetchWarning =
            (finalsR && finalsR.reason) || "finals_fetch_failed";
        }
      } catch (err) {
        finalsFetchWarning = err && err.message;
      }
    }
    if (Array.isArray(finalsMatches) && finalsMatches.length > 0) {
      mergeFinalsIntoSnapshot(snapshot, finalsMatches);

      // v2.51: 注入实时比分. cup_finals.txt 是静态的 (上游手动更新慢),
      // 而 state.json.worldcup_scores 里可能有 ESPN 拉到的淘汰赛实时比分
      // (renderer 主动刷 / bracket compute 时主动刷). 这里按 matchNum + 已确定
      // 队名匹配, 把实时比分覆盖到 snapshot 上, 让晋级的队伍 + 实时比分立刻显示.
      // 必须在 mergeFinalsIntoSnapshot 之后跑 (实时 > 静态).
      const liveScores = opts.scores ? opts.scores() : loadScoresFromState();
      mergeLiveScoresIntoSnapshot(snapshot, finalsMatches, liveScores);
    }
    if (finalsFetchWarning) {
      snapshot.warnings = snapshot.warnings || [];
      snapshot.warnings.push(`finals_fetch_${finalsFetchWarning}`);
    }

    try {
      if (opts.statePath) {
        stateStore.saveWorldcupBracket(snapshot, opts.statePath);
      } else {
        stateStore.saveWorldcupBracket(snapshot);
      }
    } catch (err) {
      mainLog.warn("[worldcup/bracket] state write failed", {
        msg: err && err.message,
      });
    }

    return { ok: true, snapshot };
  } catch (err) {
    mainLog.warn("[worldcup/bracket] compute threw", {
      msg: err && err.message,
    });
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

/**
 * Merge cup_finals.txt parsed matches into a BracketSnapshot.
 *
 * 规则:
 *   - 按 matchNum 匹配 snapshot 里每个 stage 的 match
 *   - 给 match 写 kickoff: { date, time, timezone, venue }
 *   - TXT 真名 (非 placeholder: "1A"/"W74"/"3A/B/C/D/F") 覆盖 slot.team.name
 *   - 若 TXT 已赛 (有 ft/et/pen) → status='final' + score 透传 (后续 propagate 自动算 winner)
 *
 * Placeholder 规则 (openfootball):
 *   W<num>     - 第 <num> 场 winner
 *   L<num>     - 第 <num> 场 loser
 *   L<num>...  - 同上
 *   1X         - X 组 winner (X = A..L)
 *   2X         - X 组 runner-up
 *   3A/B/C/... - best third-placed pool
 *
 * @param {object} snapshot - BracketSnapshot (mutated in-place)
 * @param {Array} finalsMatches - parsed cup_finals.txt matches (each has matchNum)
 */
function mergeFinalsIntoSnapshot(snapshot, finalsMatches) {
  const byNum = new Map();
  for (const m of finalsMatches || []) {
    if (m && typeof m.matchNum === "number") byNum.set(m.matchNum, m);
  }
  const stages = ["r32", "r16", "qf", "sf"];
  for (const stage of stages) {
    const list = snapshot[stage];
    if (!Array.isArray(list)) continue;
    for (const match of list) {
      if (!match || typeof match.matchNum !== "number") continue;
      const fm = byNum.get(match.matchNum);
      if (!fm) continue;
      attachFinals(match, fm);
    }
  }
  if (snapshot.final && typeof snapshot.final.matchNum === "number") {
    const fm = byNum.get(snapshot.final.matchNum);
    if (fm) attachFinals(snapshot.final, fm);
  }
  if (snapshot.third && typeof snapshot.third.matchNum === "number") {
    const fm = byNum.get(snapshot.third.matchNum);
    if (fm) attachFinals(snapshot.third, fm);
  }
}

function isPlaceholderTeamName(name) {
  if (typeof name !== "string") return true;
  return (
    /^[WL]\d+(-loser)?$/i.test(name) ||
    /^1[A-L]$/i.test(name) ||
    /^2[A-L]$/i.test(name) ||
    /^3[A-L](\/|$)/i.test(name)
  );
}

// ponytail: 历史 TXT/手工数据会把 "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay" 这类
// 加时/点球比分污染字符串塞进 slot.team.name. 视为非法, 触发 attachFinals
// 重新从 cup_finals.txt 拿真名覆盖.
function isPollutedTeamName(name) {
  if (typeof name !== "string") return false;
  return /a\.e\.t\.|pen\.?\s*\d/i.test(name);
}

function attachFinals(match, fm) {
  match.kickoff = {
    date: fm.date || null,
    time: fm.time || null,
    timezone: fm.timezone || null,
    venue: fm.venue || null,
  };
  if (fm.score && fm.score.ft) {
    match.score = fm.score;
    match.status = "final";
  } else if (fm.time) {
    // 未赛, 但有开球时间 → 让 renderer 可以显示倒计时. status 保持 pending/projected.
    if (
      match.status === "projected" &&
      match.slot1 &&
      match.slot1.team &&
      match.slot2 &&
      match.slot2.team
    ) {
      match.status = "pending";
    }
  }
  // TXT 真名 (非 placeholder) 覆盖 slot.team.name.
  // 历史 bug: 某些 slot.team.name 被污染成 "a.e.t. (...) pen. XXX",
  // 这种情况下强制用 fm.team1/team2 真名覆盖, 不管原值.
  const slot1Polluted = isPollutedTeamName(match.slot1 && match.slot1.team && match.slot1.team.name);
  const slot2Polluted = isPollutedTeamName(match.slot2 && match.slot2.team && match.slot2.team.name);
  if (fm.team1 && match.slot1 && !isPlaceholderTeamName(fm.team1)) {
    if (
      slot1Polluted ||
      isPlaceholderTeamName(match.slot1.team && match.slot1.team.name) ||
      match.slot1.sourceTxt !== true
    ) {
      match.slot1 = {
        ...match.slot1,
        team: { ...(match.slot1.team || {}), name: fm.team1 },
        sourceTxt: true,
      };
    }
  }
  if (fm.team2 && match.slot2 && !isPlaceholderTeamName(fm.team2)) {
    if (
      slot2Polluted ||
      isPlaceholderTeamName(match.slot2.team && match.slot2.team.name) ||
      match.slot2.sourceTxt !== true
    ) {
      match.slot2 = {
        ...match.slot2,
        team: { ...(match.slot2.team || {}), name: fm.team2 },
        sourceTxt: true,
      };
    }
  }
}

function loadScoresFromState() {
  try {
    const cache = stateStore.loadWorldcupScores();
    if (!cache || !cache.entries) return {};
    return cache.entries;
  } catch {
    return {};
  }
}

/**
 * v2.51: 把实时比分 (state.json.worldcup_scores) 注入 bracket snapshot.
 *
 * 背景: cup_finals.txt 是静态的 (openfootball 上游手动更新, 延迟可达数小时).
 * 但 ESPN/worldcup26 实时比分会先被拉到 state.json. 这里按 matchNum + 已确定
 * 队名匹配, 把实时比分覆盖到 snapshot, 让淘汰赛对阵图能实时反映:
 *   - 进行中 (live) 比分
 *   - 刚完赛的 winner (自动 propagate 到下一轮, 见 bracket-rules.propagateWinner)
 *
 * 匹配规则 (优先级从高到低):
 *   1) matchKey 完全匹配 (date|time|team1|team2 — 适用于 scores 用同样 fixture 算 key 的情况)
 *   2) teamsPairKey + 日期匹配 (队名顺序无关, 适用于 ESPN 返回的队名顺序跟 txt 相反)
 *
 * 跳过条件 (不破坏现有显示):
 *   - fixture 队名是 placeholder (W101/1A/3A...) → 队伍未确定, 无实时比分
 *   - scores 里没有匹配的 entry → 无数据可注入
 *   - entry 无 ft 比分 → 比赛未开始/数据不全
 *
 * @param {object} snapshot - BracketSnapshot (mutated in-place)
 * @param {Array} finalsMatches - parsed cup_finals.txt matches (含 matchNum + 真实队名)
 * @param {Record<string, object>} scoresEntries - state.json.worldcup_scores.entries
 */
function mergeLiveScoresIntoSnapshot(snapshot, finalsMatches, scoresEntries) {
  if (!snapshot || !Array.isArray(finalsMatches) || !scoresEntries) return;

  // finalsMatches 按 matchNum 索引, 只保留队名已确定 (非 placeholder) 的
  const finalsByNum = new Map();
  for (const fm of finalsMatches) {
    if (!fm || typeof fm.matchNum !== "number") continue;
    if (isPlaceholderTeamName(fm.team1) || isPlaceholderTeamName(fm.team2)) continue;
    finalsByNum.set(fm.matchNum, fm);
  }
  if (finalsByNum.size === 0) return;

  // scores entries 建两个索引: matchKey 直查 + (pairKey|date) 模糊查
  // matchKey 格式: date|time|team1|team2 (跟 scores-fetcher 一致)
  const byMatchKey = new Map();
  const byPairDate = new Map(); // value: { entry, team1, team2 } (存原始队名用于顺序判断)
  for (const [key, entry] of Object.entries(scoresEntries)) {
    if (!entry) continue;
    byMatchKey.set(key, entry);
    const parts = key.split("|");
    if (parts.length >= 4) {
      const date = parts[0];
      const pk = teamsPairKey(parts[2], parts[3]);
      if (pk) byPairDate.set(`${pk}|${date}`, { entry, team1: parts[2], team2: parts[3] });
    }
  }

  const stages = ["r32", "r16", "qf", "sf"];
  const allMatches = [];
  for (const stage of stages) {
    const list = snapshot[stage];
    if (Array.isArray(list)) allMatches.push(...list);
  }
  if (snapshot.final) allMatches.push(snapshot.final);
  if (snapshot.third) allMatches.push(snapshot.third);

  for (const match of allMatches) {
    if (!match || typeof match.matchNum !== "number") continue;
    const fm = finalsByNum.get(match.matchNum);
    if (!fm) continue;

    // 1) 优先 matchKey 直查 (队名顺序 + 时间完全一致)
    const mk = `${fm.date || ""}|${fm.time || ""}|${fm.team1 || ""}|${fm.team2 || ""}`;
    const direct = byMatchKey.get(mk);

    let entry;
    let needSwap = false;
    if (direct) {
      entry = direct;
    } else if (fm.date) {
      // 2) 模糊查: pairKey + date (队名顺序无关, 但需判断是否要交换 ft)
      const pk = teamsPairKey(fm.team1, fm.team2);
      const fuzzy = pk ? byPairDate.get(`${pk}|${fm.date}`) : null;
      if (fuzzy) {
        entry = fuzzy.entry;
        // entry 的 team1 跟 fm.team1 不同名 → 顺序相反, 需交换 ft + scorers.teamSide
        needSwap =
          canonicalTeamName(fuzzy.team1) !== canonicalTeamName(fm.team1);
      }
    }

    if (!entry || !Array.isArray(entry.ft)) continue;

    // 实时比分覆盖静态 (cup_finals.txt 的 score). 含 scorers 一并带入
    // (让对阵卡片能显示进球者, 进球榜也能聚合淘汰赛进球).
    // needSwap=true 时 ft 顺序交换 (对齐 fm.team1/team2 = snapshot.slot1/slot2),
    // scorers.teamSide 也跟着翻转 (team1↔team2).
    const ft = needSwap ? [entry.ft[1], entry.ft[0]] : [...entry.ft];
    let scorers = Array.isArray(entry.scorers) ? entry.scorers : null;
    if (scorers && needSwap) {
      scorers = scorers.map((s) => ({
        ...s,
        teamSide: s.teamSide === "team1" ? "team2" : s.teamSide === "team2" ? "team1" : s.teamSide,
      }));
    }
    match.score = {
      ...(match.score || {}),
      ft,
      ht: entry.ht || (match.score && match.score.ht) || null,
      status: entry.status || "final",
      updatedAt: entry.updatedAt || Date.now(),
      source: entry.source || "live",
      ...(scorers ? { scorers } : {}),
    };
    match.status = entry.status === "live" ? "live" : "final";
  }
}

/**
 * Extract group standings from group-stage matches.
 * v1 simplification: rank by pts → gd → gf from already-final matches.
 *
 * @param {Array} matches - all parsed matches
 * @param {Array<{letter: string, teams: string[]}>} groupsData - from parser
 * @returns {Record<string, {winner, runnerUp, third}|null>}
 */
function extractGroupStandings(matches, groupsData) {
  const byGroup = {};
  for (const g of groupsData || []) {
    if (!g || !g.letter) continue;
    if (!byGroup[g.letter]) byGroup[g.letter] = [];
    byGroup[g.letter].push(...(g.teams || []));
  }

  const standings = {};
  for (const [letter, teams] of Object.entries(byGroup)) {
    const ranked = rankGroup(letter, matches, teams);
    standings[letter] = ranked || null;
  }
  return standings;
}

function rankGroup(letter, matches, teams) {
  const stats = {};
  for (const t of teams) stats[t] = { pts: 0, gd: 0, gf: 0, ga: 0, played: 0 };

  for (const m of matches || []) {
    const mLetter = (m.stage || "").match(/^Group\s+([A-L])/i);
    if (!mLetter || mLetter[1].toUpperCase() !== letter) continue;
    if (!m.score || m.score.status !== "final") continue;
    const ft = m.score.ft;
    if (!Array.isArray(ft)) continue;
    const [h, a] = ft;
    if (typeof h !== "number" || typeof a !== "number") continue;
    if (!stats[m.team1] || !stats[m.team2]) continue;

    stats[m.team1].played += 1;
    stats[m.team2].played += 1;
    stats[m.team1].gf += h;
    stats[m.team2].gf += a;
    stats[m.team1].ga += a;
    stats[m.team2].ga += h;
    stats[m.team1].gd += h - a;
    stats[m.team2].gd += a - h;
    if (h > a) stats[m.team1].pts += 3;
    else if (h < a) stats[m.team2].pts += 3;
    else {
      stats[m.team1].pts += 1;
      stats[m.team2].pts += 1;
    }
  }

  const sorted = Object.entries(stats).sort((a, b) => {
    if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
    if (b[1].gd !== a[1].gd) return b[1].gd - a[1].gd;
    if (b[1].gf !== a[1].gf) return b[1].gf - a[1].gf;
    return a[0].localeCompare(b[0]);
  });

  if (sorted.length < 3) return null;

  // 如果本组没有任何比赛进行过 (所有队 played=0), 视为无数据
  // 这样可以避免把所有组都填上 best-effort (pts=0 全部相同 → 字母序) 的"假数据",
  // 进而污染 third-placed 排序.
  const hasAnyMatch = sorted.some(([, s]) => s.played > 0);
  if (!hasAnyMatch) return null;

  // best-effort: 有 ≥1 场比赛即可返回当前 best-of 排名
  // 用 played >= 3 标记组赛是否完赛
  const complete = sorted.length >= 3 && sorted.every(([, s]) => s.played >= 3);
  return {
    winner: sorted[0][0],
    runnerUp: sorted[1][0],
    third: {
      name: sorted[2][0],
      pts: sorted[2][1].pts,
      gd: sorted[2][1].gd,
      gf: sorted[2][1].gf,
      ga: sorted[2][1].ga,
    },
    complete,
  };
}

/**
 * Load cached bracket snapshot from state.json.
 *
 * @param {object} [opts]
 * @param {string} [opts.statePath] - injected for tests
 * @returns {{ok: boolean, snapshot: object|null, reason?: string, error?: string}}
 */
function loadWorldcupBracket(opts = {}) {
  try {
    const snap = opts.statePath
      ? stateStore.loadWorldcupBracket(opts.statePath)
      : stateStore.loadWorldcupBracket();
    return { ok: true, snapshot: snap || null };
  } catch (err) {
    return { ok: false, reason: "load_failed", error: err && err.message };
  }
}

module.exports = {
  computeWorldcupBracket,
  loadWorldcupBracket,
  extractGroupStandings,
  rankGroup,
  mergeFinalsIntoSnapshot,
  mergeLiveScoresIntoSnapshot,
  isPlaceholderTeamName,
  isPollutedTeamName,
};
