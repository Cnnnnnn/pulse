/**
 * src/main/worldcup/bracket.ts
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

const stateStore = require("../state-store.ts");
const { computeBracket } = require("./bracket-rules.ts");
const { mainLog } = require("../log.ts");
const { fetchWorldcupFixtures, loadFinalsTxt } = require("./fetcher.ts");
const { teamsPairKey, canonicalTeamName } = require("./team-aliases.ts");
const { matchKickoffUtcMs, matchKey } = require("./match-key.ts");
const {
  fetchWc2026Schedule,
  indexWc2026ByMatchNum,
} = require("./scores-fetcher-wc2026.ts");
const { fetchScoresFromEspn } = require("./scores-api-espn.ts");
const { parseWorldcupTxt } = require("./parser.ts");
const { HttpClient } = require("../http-client.ts");

/**
 * Compute full bracket from current group standings + scores.
 */
export async function computeWorldcupBracket(opts: any = {}): Promise<any> {
  try {
    const fetcher = opts.fetcher;
    let fixturesR: any = null;
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
    let finalsFetchWarning: string | null = null;
    if (!Array.isArray(finalsMatches)) {
      try {
        const finalsFetcher = opts.finalsFetcher || loadFinalsTxt;
        const finalsR = await finalsFetcher();
        if (finalsR && finalsR.ok && finalsR.txt) {
          const finalsData = parseWorldcupTxt(finalsR.txt);
          finalsMatches = finalsData.matches || [];
        } else {
          finalsFetchWarning =
            (finalsR && finalsR.reason) || "finals_fetch_failed";
        }
      } catch (err: any) {
        finalsFetchWarning = err && err.message;
      }
    }
    if (Array.isArray(finalsMatches) && finalsMatches.length > 0) {
      mergeFinalsIntoSnapshot(snapshot, finalsMatches);

      // v2.74.3: 主动拉一次 ESPN 拉 knockout scorers.
      let liveScores = opts.scores ? opts.scores() : loadScoresFromState();
      if (opts.knockoutEspn !== false) {
        try {
          const enriched = await fetchKnockoutEspnEntries(
            finalsMatches,
            opts.knockoutEspn || {},
          );
          if (enriched && Object.keys(enriched).length > 0) {
            liveScores = { ...(liveScores || {}), ...enriched };
          }
        } catch (err: any) {
          mainLog.warn("[worldcup/bracket] knockout espn fetch threw", {
            msg: err && err.message,
          });
        }
      }
      mergeLiveScoresIntoSnapshot(snapshot, finalsMatches, liveScores);
    }

    // v2.74: 注入 wc-2026.com 的加时/点球比分.
    if (opts.wc2026 !== false) {
      try {
        await mergeWc2026EtPen(snapshot, opts.wc2026 || {});
      } catch (err: any) {
        mainLog.warn("[worldcup/bracket] wc2026 hook threw", {
          msg: err && err.message,
        });
      }
    }

    // v2.74.1: 已知 R32 比赛 et/pen 硬编码 fallback.
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
    } catch (err: any) {
      mainLog.warn("[worldcup/bracket] state write failed", {
        msg: err && err.message,
      });
    }

    return { ok: true, snapshot };
  } catch (err: any) {
    mainLog.warn("[worldcup/bracket] compute threw", {
      msg: err && err.message,
    });
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

/**
 * Merge cup_finals.txt parsed matches into a BracketSnapshot.
 */
export function mergeFinalsIntoSnapshot(snapshot: any, finalsMatches: any[]): void {
  const byNum = new Map<number, any>();
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

export function isPlaceholderTeamName(name: any): boolean {
  if (typeof name !== "string") return true;
  return (
    /^[WL]\d+(-loser)?$/i.test(name) ||
    /^1[A-L]$/i.test(name) ||
    /^2[A-L]$/i.test(name) ||
    /^3[A-L](\/|$)/i.test(name)
  );
}

// ponytail: 历史 TXT/手工数据会把 "a.e.t. (1-1, 0-1), 3-4 pen. Paraguay" 这类
// 加时/点球比分污染字符串塞进 slot.team.name.
export function isPollutedTeamName(name: any): boolean {
  if (typeof name !== "string") return false;
  return /a\.e\.t\.|pen\.?\s*\d/i.test(name);
}

/**
 * v2.74.3: 把污染字符串尾部真实队名抽出来.
 */
export function cleanPollutedTeamName(name: any): string {
  if (typeof name !== "string") return name;
  if (!isPollutedTeamName(name)) return name;
  const matches = name.match(/[A-Z][a-zA-ZÀ-ÿ' .-]+(?=$)/g);
  if (matches && matches.length > 0) return matches[matches.length - 1].trim();
  return name;
}

function attachFinals(match: any, fm: any): void {
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
  const slot1Polluted = isPollutedTeamName(
    match.slot1 && match.slot1.team && match.slot1.team.name,
  );
  const slot2Polluted = isPollutedTeamName(
    match.slot2 && match.slot2.team && match.slot2.team.name,
  );
  const fmTeam1Clean = fm.team1 ? cleanPollutedTeamName(fm.team1) : null;
  const fmTeam2Clean = fm.team2 ? cleanPollutedTeamName(fm.team2) : null;
  if (fmTeam1Clean && match.slot1 && !isPlaceholderTeamName(fmTeam1Clean)) {
    if (
      slot1Polluted ||
      isPlaceholderTeamName(match.slot1.team && match.slot1.team.name) ||
      match.slot1.sourceTxt !== true
    ) {
      match.slot1 = {
        ...match.slot1,
        team: { ...(match.slot1.team || {}), name: fmTeam1Clean },
        sourceTxt: true,
      };
    }
  }
  if (fmTeam2Clean && match.slot2 && !isPlaceholderTeamName(fmTeam2Clean)) {
    if (
      slot2Polluted ||
      isPlaceholderTeamName(match.slot2.team && match.slot2.team.name) ||
      match.slot2.sourceTxt !== true
    ) {
      match.slot2 = {
        ...match.slot2,
        team: { ...(match.slot2.team || {}), name: fmTeam2Clean },
        sourceTxt: true,
      };
    }
  }
}

function loadScoresFromState(): any {
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
 */
export function mergeLiveScoresIntoSnapshot(snapshot: any, finalsMatches: any[], scoresEntries: any): void {
  if (!snapshot || !Array.isArray(finalsMatches) || !scoresEntries) return;

  const finalsByNum = new Map<number, any>();
  for (const fm of finalsMatches) {
    if (!fm || typeof fm.matchNum !== "number") continue;
    if (isPlaceholderTeamName(fm.team1) || isPlaceholderTeamName(fm.team2))
      continue;
    finalsByNum.set(fm.matchNum, fm);
  }
  if (finalsByNum.size === 0) return;

  const byMatchKey = new Map<string, any>();
  const byPairDate = new Map<string, any>();
  for (const [key, entry] of Object.entries(scoresEntries)) {
    if (!entry) continue;
    byMatchKey.set(key, entry);
    const parts = key.split("|");
    if (parts.length >= 4) {
      const date = parts[0];
      const pk = teamsPairKey(parts[2], parts[3]);
      if (pk)
        byPairDate.set(`${pk}|${date}`, {
          entry,
          team1: parts[2],
          team2: parts[3],
        });
    }
  }

  const stages = ["r32", "r16", "qf", "sf"];
  const allMatches: any[] = [];
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

    const fmT1 = cleanPollutedTeamName(fm.team1 || "");
    const fmT2 = cleanPollutedTeamName(fm.team2 || "");
    const mk = `${fm.date || ""}|${fm.time || ""}|${fmT1}|${fmT2}`;
    const direct = byMatchKey.get(mk);

    let entry;
    let needSwap = false;
    if (direct) {
      entry = direct;
    } else if (fm.date) {
      const pk = teamsPairKey(
        cleanPollutedTeamName(fm.team1),
        cleanPollutedTeamName(fm.team2),
      );
      const fuzzy = pk ? byPairDate.get(`${pk}|${fm.date}`) : null;
      if (fuzzy) {
        entry = fuzzy.entry;
        needSwap =
          canonicalTeamName(fuzzy.team1) !==
          canonicalTeamName(cleanPollutedTeamName(fm.team1));
      }
    }

    if (!entry || !Array.isArray(entry.ft)) continue;

    const ft = needSwap ? [entry.ft[1], entry.ft[0]] : [...entry.ft];
    let scorers = Array.isArray(entry.scorers) ? entry.scorers : null;
    if (scorers && needSwap) {
      scorers = scorers.map((s: any) => ({
        ...s,
        teamSide:
          s.teamSide === "team1"
            ? "team2"
            : s.teamSide === "team2"
              ? "team1"
              : s.teamSide,
      }));
    }
    const et =
      Array.isArray(entry.et) && entry.et.length === 2
        ? needSwap
          ? [entry.et[1], entry.et[0]]
          : [...entry.et]
        : match.score && Array.isArray(match.score.et)
          ? match.score.et
          : null;
    const pen =
      Array.isArray(entry.pen) && entry.pen.length === 2
        ? needSwap
          ? [entry.pen[1], entry.pen[0]]
          : [...entry.pen]
        : match.score && Array.isArray(match.score.pen)
          ? match.score.pen
          : null;
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
 * v2.74.3: bracket compute 时主动拉 ESPN scoreboard 拉 knockout scorers.
 */
export async function fetchKnockoutEspnEntries(finalsMatches: any[], opts: any = {}): Promise<Record<string, any>> {
  if (!Array.isArray(finalsMatches) || finalsMatches.length === 0) return {};
  const http = opts.http || new HttpClient({ timeout: 12000 });
  const fetchEspn = opts.fetchEspn || fetchScoresFromEspn;
  try {
    const entries = await fetchEspn(http, finalsMatches, matchKey);
    if (!entries || typeof entries !== "object") return {};
    let withScorers = 0;
    for (const e of Object.values(entries) as any[]) {
      if (e && Array.isArray(e.scorers) && e.scorers.length > 0) withScorers++;
    }
    if (withScorers > 0) {
      mainLog.info("[worldcup/bracket] knockout espn scorers fetched", {
        total: Object.keys(entries).length,
        withScorers,
      });
    }
    return entries;
  } catch (err: any) {
    mainLog.warn("[worldcup/bracket] knockout espn fetch failed", {
      msg: err && err.message,
    });
    return {};
  }
}

/**
 * 从 wc-2026.com 抓比赛结果 HTML, 把加时/点球比分注入到 snapshot 上.
 */
export async function mergeWc2026EtPen(snapshot: any, opts: any = {}): Promise<any> {
  if (!snapshot) return { updated: 0, source: null };
  try {
    const http = opts.http || new HttpClient({ timeout: 15000 });
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
      const cur = m.score || {};
      const next: any = { ...cur };
      let changed = false;
      if (
        w.pen &&
        (!Array.isArray(cur.pen) ||
          cur.pen[0] !== w.pen[0] ||
          cur.pen[1] !== w.pen[1])
      ) {
        next.pen = w.pen;
        changed = true;
      }
      if (Array.isArray(w.et) && w.et.length === 2) {
        if (
          !Array.isArray(cur.et) ||
          cur.et[0] !== w.et[0] ||
          cur.et[1] !== w.et[1]
        ) {
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
  } catch (err: any) {
    mainLog.warn("[worldcup/bracket] wc2026 merge threw", {
      msg: err && err.message,
    });
    return { updated: 0, source: "wc2026", error: err && err.message };
  }
}

function _allBracketMatches(snapshot: any): any[] {
  const out: any[] = [];
  for (const k of ["r32", "r16", "qf", "sf"]) {
    if (Array.isArray(snapshot[k])) out.push(...snapshot[k]);
  }
  if (snapshot.final) out.push(snapshot.final);
  if (snapshot.third) out.push(snapshot.third);
  return out;
}

/**
 * Extract group standings from group-stage matches.
 */
export function extractGroupStandings(matches: any[], groupsData: any[]): Record<string, any> {
  const byGroup: Record<string, string[]> = {};
  for (const g of groupsData || []) {
    if (!g || !g.letter) continue;
    if (!byGroup[g.letter]) byGroup[g.letter] = [];
    byGroup[g.letter].push(...(g.teams || []));
  }

  const standings: Record<string, any> = {};
  for (const [letter, teams] of Object.entries(byGroup)) {
    const ranked = rankGroup(letter, matches, teams);
    standings[letter] = ranked || null;
  }
  return standings;
}

export function rankGroup(letter: any, matches: any[], teams: string[]): any {
  const stats: Record<string, any> = {};
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
    const sa = a[1] as any;
    const sb = b[1] as any;
    if (sb.pts !== sa.pts) return sb.pts - sa.pts;
    if (sb.gd !== sa.gd) return sb.gd - sa.gd;
    if (sb.gf !== sa.gf) return sb.gf - sa.gf;
    return a[0].localeCompare(b[0]);
  });

  if (sorted.length < 3) return null;

  const hasAnyMatch = sorted.some(([, s]) => (s as any).played > 0);
  if (!hasAnyMatch) return null;

  const complete = sorted.length >= 3 && sorted.every(([, s]) => (s as any).played >= 3);
  return {
    winner: sorted[0][0],
    runnerUp: sorted[1][0],
    third: {
      name: sorted[2][0],
      pts: (sorted[2][1] as any).pts,
      gd: (sorted[2][1] as any).gd,
      gf: (sorted[2][1] as any).gf,
      ga: (sorted[2][1] as any).ga,
    },
    complete,
  };
}

/**
 * 已知 R32 加时/点球比分硬编码 fallback (应急 belt-and-suspenders).
 */
export const HARDCODED_R32_ET_PEN: Record<number, any> = {
  74: { et: [0, 0], pen: [3, 4] },
  75: { et: [0, 0], pen: [2, 3] },
  82: { et: [1, 0] },
  88: { et: [0, 0], pen: [2, 4] },
};

/**
 * 把 HARDCODED_R32_ET_PEN 注入到 snapshot.
 */
export function mergeHardcodedR32EtPen(snapshot: any, opts: any = {}): { updated: number } {
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
 */
export function loadWorldcupBracket(opts: any = {}): any {
  try {
    const snap = opts.statePath
      ? stateStore.loadWorldcupBracket(opts.statePath)
      : stateStore.loadWorldcupBracket();
    return { ok: true, snapshot: snap || null };
  } catch (err: any) {
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
  fetchKnockoutEspnEntries,
  mergeWc2026EtPen,
  mergeHardcodedR32EtPen,
  HARDCODED_R32_ET_PEN,
  isPlaceholderTeamName,
  isPollutedTeamName,
};