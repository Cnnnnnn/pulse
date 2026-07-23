/**
 * src/main/worldcup/goal-watcher.ts
 *
 * v2.16.0 世界杯进球通知 — 60s 调度 + 纯函数 diff + 系统通知.
 */
"use strict";

const stateStore = require("../state-store.ts");
const { mainLog } = require("../log.ts");
const { matchKey, isMatchStarted, matchKickoffUtcMs } = require("./match-key.ts");
const { parseWorldcupTxt } = require("./parser.ts");
const { refreshWorldcupScores } = require("./scores-fetcher.ts");

const SWEEP_INTERVAL_MS = 60 * 1000;       // 60s
const MAX_GOAL_KEYS_PER_MATCH = 50;        // 单场 goalKey 上限
const MAX_NOTIFICATIONS_PER_SWEEP = 10;    // 单 sweep 推送上限
const MATCH_TOO_OLD_DAYS = 30;             // 30 天前比赛排除

function _goalKeyOfScorer(scorer: any): string {
  if (!scorer) return "";
  return `${scorer.minute || ""}|${scorer.player || "undefined"}|${scorer.teamSide || ""}`;
}

function _diffNewGoals(prevScores: any, newScores: any, prevNotified: any): any[] {
  const out: any[] = [];
  const prev = prevScores || {};
  const next = newScores || {};
  const notified = prevNotified || {};

  for (const matchKeyStr of Object.keys(next)) {
    const newEntry: any = (next as any)[matchKeyStr];
    if (!newEntry || !Array.isArray(newEntry.scorers)) continue;
    if (newEntry.status === "final" && newEntry.scorers.length > 0) continue;

    const prevEntry: any = (prev as any)[matchKeyStr];
    const prevScorers = (prevEntry && Array.isArray(prevEntry.scorers)) ? prevEntry.scorers : [];
    const prevScorerKeys = new Set(prevScorers.map(_goalKeyOfScorer));
    const alreadyNotified = new Set(
      ((notified[matchKeyStr] || {}).notified || []),
    );

    for (const scorer of newEntry.scorers) {
      const key = _goalKeyOfScorer(scorer);
      if (prevScorerKeys.has(key)) continue;
      if (alreadyNotified.has(key)) continue;
      out.push({ matchKey: matchKeyStr, scorer, key });
    }
  }
  return out;
}

function _formatGoalNotification(scorer: any, fixture: any): { title: string; body: string } {
  const prefix = scorer.ownGoal ? "乌龙球 · " : scorer.penalty ? "点球 · " : "进球 · ";
  const teamName = scorer.teamSide === "team1" ? fixture.team1 : fixture.team2;
  const oppName = scorer.teamSide === "team1" ? fixture.team2 : fixture.team1;
  const ft = fixture.score && Array.isArray(fixture.score.ft) ? fixture.score.ft : null;
  const scoreStr = ft ? `${ft[0]}-${ft[1]}` : "";
  const body = scoreStr
    ? `${teamName} vs ${oppName} · 当前 ${scoreStr}`
    : `${teamName} vs ${oppName}`;
  return {
    title: `${prefix}${scorer.minute || ""} ${scorer.player || ""}`.trim(),
    body,
  };
}

async function _sweepOnce(now: number, deps: any): Promise<any> {
  const { refreshScores, loadFixtures, onGoal, onScoresChanged, log, onError, statePath } = deps;
  const errors: string[] = [];
  let notifiedCount = 0;

  try {
    const cached = loadFixtures();
    if (!cached || !cached.txt) {
      log.info("[goal-watcher] no fixtures cache, skip");
      return { notifiedCount: 0, errors: ["no_fixtures"] };
    }
    const fixturesData = parseWorldcupTxt(cached.txt);
    const allMatches = (fixturesData && fixturesData.matches) || [];

    const oldScoresCache = stateStore.loadWorldcupScores(statePath) || { entries: {} };
    const oldEntries = oldScoresCache.entries || {};
    const cutoffMs = now - MATCH_TOO_OLD_DAYS * 86400_000;
    const eligibleKeys = allMatches
      .filter((m: any) => isMatchStarted(m, now))
      .filter((m: any) => {
        const k = matchKickoffUtcMs(m);
        return k != null && k >= cutoffMs;
      })
      .filter((m: any) => {
        const e = oldEntries[matchKey(m)];
        if (e && e.status === "final" && Array.isArray(e.scorers) && e.scorers.length > 0) return false;
        return true;
      })
      .map(matchKey);

    if (eligibleKeys.length === 0) {
      return { notifiedCount: 0, errors: [] };
    }

    const refresh = await refreshScores(eligibleKeys);
    if (!refresh || !refresh.ok) {
      log.warn("[goal-watcher] refresh failed", { reason: refresh && refresh.reason });
      return { notifiedCount: 0, errors: ["refresh_failed"] };
    }
    const newScores = refresh.scores || {};

    if (typeof onScoresChanged === "function") {
      try {
        onScoresChanged({
          ...newScores,
          _updatedKeys: Array.isArray(refresh.updatedKeys)
            ? refresh.updatedKeys
            : [],
        });
      } catch (err: any) {
        log.warn("[worldcup/goal-watcher] onScoresChanged failed", {
          msg: err && err.message,
        });
      }
    }

    const raw = stateStore.load(statePath) || {};
    const prevNotified = raw.worldcupGoalNotified || {};

    const newGoals = _diffNewGoals(oldEntries, newScores, prevNotified);
    if (newGoals.length === 0) {
      return { notifiedCount: 0, errors: [] };
    }

    const byKey = new Map(allMatches.map((m: any) => [matchKey(m), m]));
    const toNotify = newGoals.slice(0, MAX_NOTIFICATIONS_PER_SWEEP);
    const notifiedMap = new Map<string, string[]>();

    for (const g of toNotify) {
      const fixture: any = byKey.get(g.matchKey);
      if (!fixture) continue;
      const fixtureWithScore: any = { ...fixture, score: (newScores as any)[g.matchKey] };
      const notif = _formatGoalNotification(g.scorer, fixtureWithScore);
      try {
        onGoal(notif, { matchKey: g.matchKey, scorer: g.scorer, fixture });
        if (!notifiedMap.has(g.matchKey)) notifiedMap.set(g.matchKey, []);
        notifiedMap.get(g.matchKey)!.push(g.key);
        notifiedCount += 1;
      } catch (err: any) {
        log.warn("[goal-watcher] onGoal failed", { msg: err.message });
        errors.push(`onGoal_failed:${g.matchKey}`);
      }
    }

    if (notifiedMap.size > 0) {
      try {
        stateStore.patchState((next: any) => {
          const prev = next.worldcupGoalNotified || {};
          const merged: Record<string, any> = { ...prev };
          for (const [mk, keys] of notifiedMap) {
            const existingKeys = (prev[mk] && prev[mk].notified) || [];
            merged[mk] = {
              notified: [...existingKeys, ...keys].slice(-MAX_GOAL_KEYS_PER_MATCH),
              updatedAt: now,
            };
          }
          next.worldcupGoalNotified = merged;
        }, statePath);
      } catch (err: any) {
        log.warn("[goal-watcher] state write failed", { msg: err.message });
        errors.push("state_write_failed");
      }
    }

    return { notifiedCount, errors };
  } catch (err: any) {
    if (typeof onError === "function") onError(err);
    return { notifiedCount, errors: [...errors, (err && err.message) || "unknown"] };
  }
}

let _sweepTimer: any = null;
let _onGoal: any = null;
let _deps: any = null;

export function startGoalWatcher(deps: any): void {
  if (!deps || typeof deps.onGoal !== "function") {
    throw new TypeError("startGoalWatcher: deps.onGoal must be function");
  }
  if (typeof deps.refreshScores !== "function") {
    throw new TypeError("startGoalWatcher: deps.refreshScores must be function");
  }
  if (typeof deps.loadFixtures !== "function") {
    throw new TypeError("startGoalWatcher: deps.loadFixtures must be function");
  }
  stopGoalWatcher();
  _deps = deps;
  _onGoal = deps.onGoal;
  const log = deps.log || { info: () => {}, warn: () => {}, error: () => {} };
  const now0 = typeof deps.now === "number" ? deps.now : Date.now();

  _sweepOnce(now0, deps).catch((err: any) => {
    log.warn("[goal-watcher] initial sweep failed", { msg: err && err.message });
  });

  _sweepTimer = setInterval(() => {
    _sweepOnce(Date.now(), _deps || deps).catch((err: any) => {
      log.warn("[goal-watcher] sweep failed", { msg: err && err.message });
    });
  }, SWEEP_INTERVAL_MS);
  if (_sweepTimer && typeof _sweepTimer.unref === "function") {
    _sweepTimer.unref();
  }
}

export function stopGoalWatcher(): void {
  if (_sweepTimer) {
    clearInterval(_sweepTimer);
    _sweepTimer = null;
  }
  _onGoal = null;
  _deps = null;
}

export function isGoalWatcherRunning(): boolean {
  return _sweepTimer !== null;
}

module.exports = {
  _goalKeyOfScorer,
  _diffNewGoals,
  _formatGoalNotification,
  _sweepOnce,
  get _sweepTimer() { return _sweepTimer; },
  startGoalWatcher,
  stopGoalWatcher,
  isGoalWatcherRunning,
  SWEEP_INTERVAL_MS,
  MAX_GOAL_KEYS_PER_MATCH,
  MAX_NOTIFICATIONS_PER_SWEEP,
  MATCH_TOO_OLD_DAYS,
};