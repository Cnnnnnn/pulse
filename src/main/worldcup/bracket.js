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
const {
  fetchWc2026Schedule,
  indexWc2026ByMatchNum,
} = require("./scores-fetcher-wc2026");
const { HttpClient } = require("../http-client");

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

    // v2.74: 注入 wc-2026.com 的加时/点球比分. 跟 worldcup_scores.entries 独立
    // (不依赖 matchKey 字符串相等), 用 pair key + 邻近日期模糊匹配. 只补
    // score.pen / score.et 字段, 不动 ft.
    if (opts.wc2026 !== false) {
      try {
        await mergeWc2026EtPen(snapshot, opts.wc2026 || {});
      } catch (err) {
        mainLog.warn("[worldcup/bracket] wc2026 hook threw", {
          msg: err && err.message,
        });
      }
    }

    // v2.74.1: 已知 R32 比赛 et/pen 硬编码 fallback. wc-2026 源对中国大陆
    // 外 IP 不可达 + wc26 mirror 没 pen 字段, 在没自动源能补 pen 时, 用
    // 验证过的零星战报数据兜底. 将来 ESL 流能稳定提供时移除.
    if (opts.hardcodedPen !== false) {
      const r = mergeHardcodedR32EtPen(snapshot, opts.hardcodedPen || {});
      if (r.updated > 0) {
        mainLog.info("[worldcup/bracket] hardcoded pen injected", {
          count: r.updated,
        });
      }
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
    // ponytail: 透传加时/点球比分. ESPN 流或 wc-2026.com 源补 score.et/pen,
    // 来自 worldcup_scores.entries 的 et/pen 字段. wc-2026 主走 mergeWc2026EtPen
    // (见下面), 这里只负责透传 entries 里已有的 et/pen.
    const et = Array.isArray(entry.et) && entry.et.length === 2
      ? (needSwap ? [entry.et[1], entry.et[0]] : [...entry.et])
      : (match.score && Array.isArray(match.score.et) ? match.score.et : null);
    const pen = Array.isArray(entry.pen) && entry.pen.length === 2
      ? (needSwap ? [entry.pen[1], entry.pen[0]] : [...entry.pen])
      : (match.score && Array.isArray(match.score.pen) ? match.score.pen : null);
    match.score = {
      ...(match.score || {}),
      ft,
      ht: entry.ht || (match.score && match.score.ht) || null,
      status: entry.status || "final",
      updatedAt: entry.updatedAt || Date.now(),
      source: entry.source || "live",
      ...(et ? { et } : {}),
      ...(pen ? { pen } : {}),
      ...(scorers ? { scorers } : {}),
    };
    match.status = entry.status === "live" ? "live" : "final";
  }
}

/**
 * 从 wc-2026.com 抓比赛结果 HTML, 把加时/点球比分注入到 snapshot 上.
 *
 * 为什么独立函数: wc-2026.com 时间是北京时间 (UTC+8), openfootball fixture 是
 * 比赛当地时间 (UTC±X). matchKey 字符串比较对不上. 所以 wc-2026 数据**不进**
 * worldcup_scores.entries, 而是用 pair key + 邻近日期匹配 bracket snapshot 的
 * matchNum, 只补 score.pen / score.et 字段 (不动 ft, ft 由其他源覆盖).
 *
 * 失败不阻塞 bracket 计算 (整个函数 try/catch, 失败只 mainLog.warn).
 * opts.http / opts.fetchSchedule 注入便于单测.
 */
async function mergeWc2026EtPen(snapshot, opts = {}) {
  if (!snapshot) return { updated: 0, source: null };
  try {
    const http =
      opts.http ||
      new HttpClient({ timeout: 15000 });
    const fetchFn = opts.fetchSchedule || fetchWc2026Schedule;
    const r = await fetchFn(http);
    if (!r || !r.ok || !Array.isArray(r.matches) || r.matches.length === 0) {
      return { updated: 0, source: "wc2026" };
    }
    const idx = indexWc2026ByMatchNum(r.matches, snapshot);
    if (idx.size === 0) return { updated: 0, source: "wc2026" };

    let updated = 0;
    for (const m of _allBracketMatches(snapshot)) {
      if (!m || typeof m.matchNum !== "number") continue;
      const w = idx.get(m.matchNum);
      if (!w) continue;
      // ponytail: 只补 pen / et. ft 由 mergeLiveScoresIntoSnapshot 覆盖,
      // 这里不要再动 (避免 wc-2026 解析误差盖掉 ESPN 准数据).
      const cur = m.score || {};
      const next = { ...cur };
      let changed = false;
      if (w.pen && (!Array.isArray(cur.pen) || cur.pen[0] !== w.pen[0] || cur.pen[1] !== w.pen[1])) {
        next.pen = w.pen;
        changed = true;
      }
      // et wc-2026.com 主页不提供 (等未来 detail 页 scraper), 这里保留
      // 透传已有 entry.et 字段的能力.
      if (Array.isArray(w.et) && w.et.length === 2) {
        if (!Array.isArray(cur.et) || cur.et[0] !== w.et[0] || cur.et[1] !== w.et[1]) {
          next.et = w.et;
          changed = true;
        }
      }
      if (changed) {
        next.source = cur.source || "wc2026";
        next.updatedAt = Date.now();
        m.score = next;
        updated += 1;
      }
    }
    return { updated, source: "wc2026" };
  } catch (err) {
    mainLog.warn("[worldcup/bracket] wc2026 merge threw", {
      msg: err && err.message,
    });
    return { updated: 0, source: "wc2026", error: err && err.message };
  }
}

function _allBracketMatches(snapshot) {
  const out = [];
  for (const k of ["r32", "r16", "qf", "sf"]) {
    if (Array.isArray(snapshot[k])) out.push(...snapshot[k]);
  }
  if (snapshot.final) out.push(snapshot.final);
  if (snapshot.third) out.push(snapshot.third);
  return out;
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
 * 已知 R32 加时/点球比分硬编码 fallback.
 *
 * ponytail: 当前 wc-2026.com 源对中国大陆外 IP 不可达 (cloudflare 风控),
 * wc26.ir 主源 502, worldcup26 mirror (wc2026.moothz.win) 没 penalty 字段.
 * 在没自动源能给 R32 比赛 pen 数字时, 把已知点球大战结果写死在代码里,
 * 至少 UI 能显示 "点球 3:4" 等标签.
 *
 * 数据来源: zerozero.asia / 球迷屋 / 7M 公开战报 (2026-06-30 / 2026-07-02 验证).
 *
 * 将来真正上游源能稳定提供 et/pen 时 (例如 ESL 流 score-fetcher 拿到),
 * 这块代码应移除, 走 entry.pen 自动注入路径.
 */
const HARDCODED_R32_ET_PEN = {
  // M74: 德国 1-1 巴拉圭 (90 分), 加时 0-0, 点球 3-4 巴拉圭胜
  74: { et: [0, 0], pen: [3, 4] },
  // M75: 荷兰 1-1 摩洛哥 (90 分), 加时 0-0, 点球 2-3 摩洛哥胜
  75: { et: [0, 0], pen: [2, 3] },
};

/**
 * 把 HARDCODED_R32_ET_PEN 注入到 snapshot. 只在 score.pen / score.et
 * 字段还没值时才填, 避免覆盖更权威源 (ESL 流 / wc-2026 / 实测 pen).
 *
 * @param {object} snapshot
 * @param {object} [opts]
 * @param {object} [opts.table] - 测试注入 (默认 HARDCODED_R32_ET_PEN)
 * @returns {{updated: number}}
 */
function mergeHardcodedR32EtPen(snapshot, opts = {}) {
  if (!snapshot) return { updated: 0 };
  const table = opts.table || HARDCODED_R32_ET_PEN;
  if (!table || Object.keys(table).length === 0) return { updated: 0 };
  let updated = 0;
  for (const m of _allBracketMatches(snapshot)) {
    if (!m || typeof m.matchNum !== "number") continue;
    const data = table[m.matchNum];
    if (!data) continue;
    m.score = m.score || {};
    let changed = false;
    // ponytail: 只在 pen/et 字段缺失时注入. 已存在的 (任何来源:
    // ESL 流 / wc-2026 / 用户手动) 都视为权威, hardcoded 不覆盖.
    if (data.pen && !Array.isArray(m.score.pen)) {
      m.score.pen = data.pen;
      m.score.source = m.score.source || "hardcoded-r32";
      m.score.updatedAt = Date.now();
      changed = true;
    }
    if (data.et && !Array.isArray(m.score.et)) {
      m.score.et = data.et;
      m.score.source = m.score.source || "hardcoded-r32";
      m.score.updatedAt = Date.now();
      changed = true;
    }
    if (changed) updated += 1;
  }
  return { updated };
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
  mergeWc2026EtPen,
  mergeHardcodedR32EtPen,
  HARDCODED_R32_ET_PEN,
  isPlaceholderTeamName,
  isPollutedTeamName,
};
