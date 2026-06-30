/**
 * src/main/worldcup/goal-watcher.js
 *
 * v2.16.0 世界杯进球通知 — 60s 调度 + 纯函数 diff + 系统通知.
 *
 * 模式跟 src/main/reminders.js 一致:
 *   - 走 state-store.patchState (atomic write, preserveExtraFields)
 *   - 顶层 state.json.worldcupGoalNotified = { [matchKey]: { notified: string[], updatedAt: number } }
 *   - 调度: setInterval(60s) sweep, onGoal 调 onGoal(notif, meta)
 *
 * 去重: 双重过滤
 *   1) prevScorers 数组 (上轮 scorers) — 防止 60s 内重复推
 *   2) notified list (state 持久化) — 防止重启后重推历史进球
 *
 * 进球类型标记: ownGoal / penalty 在通知标题加前缀; 不进 key.
 */

const stateStore = require("../state-store");
const { mainLog } = require("../log");
const { matchKey, isMatchStarted, matchKickoffUtcMs } = require("./match-key");
const { parseWorldcupTxt } = require("./parser");
const { refreshWorldcupScores } = require("./scores-fetcher");

const SWEEP_INTERVAL_MS = 60 * 1000;       // 60s
const MAX_GOAL_KEYS_PER_MATCH = 50;        // 单场 goalKey 上限
const MAX_NOTIFICATIONS_PER_SWEEP = 10;    // 单 sweep 推送上限
const MATCH_TOO_OLD_DAYS = 30;             // 30 天前比赛排除

// ── 纯函数 ─────────────────────────────────────────────────

/**
 * 拼去重 key: minute|player|teamSide
 * 不用 ownGoal/penalty 进 key (ESPN 偶尔漏标, 会破坏去重).
 * @param {{minute: string, player: string, teamSide: string, ownGoal?: boolean, penalty?: boolean}} scorer
 * @returns {string}
 */
function _goalKeyOfScorer(scorer) {
  if (!scorer) return "";
  return `${scorer.minute || ""}|${scorer.player || "undefined"}|${scorer.teamSide || ""}`;
}

/**
 * Diff 新进球: 比对 prevScores / newScores, 双重过滤 (prevScorers + notified list).
 * 纯函数, 无 IO.
 * @param {object} prevScores    { [matchKey]: scoreEntry }
 * @param {object} newScores     { [matchKey]: scoreEntry }
 * @param {object} prevNotified  { [matchKey]: { notified: string[], updatedAt: number } }
 * @returns {Array<{matchKey: string, scorer: object, key: string}>}
 */
function _diffNewGoals(prevScores, newScores, prevNotified) {
  const out = [];
  const prev = prevScores || {};
  const next = newScores || {};
  const notified = prevNotified || {};

  for (const [matchKeyStr, newEntry] of Object.entries(next)) {
    if (!newEntry || !Array.isArray(newEntry.scorers)) continue;
    // 完赛 + 有 scorers → 视为已 stable, 跳过 (防止重启后重推历史)
    if (newEntry.status === "final" && newEntry.scorers.length > 0) continue;

    const prevEntry = prev[matchKeyStr];
    const prevScorers = (prevEntry && Array.isArray(prevEntry.scorers)) ? prevEntry.scorers : [];
    const prevScorerKeys = new Set(prevScorers.map(_goalKeyOfScorer));
    const alreadyNotified = new Set(
      ((notified[matchKeyStr] || {}).notified || []),
    );

    for (const scorer of newEntry.scorers) {
      const key = _goalKeyOfScorer(scorer);
      if (prevScorerKeys.has(key)) continue;       // 上轮已含 (60s 内重复抓)
      if (alreadyNotified.has(key)) continue;      // 已通知过 (重启后)
      out.push({ matchKey: matchKeyStr, scorer, key });
    }
  }
  return out;
}

/**
 * 拼系统通知的 title + body. 纯函数.
 * @param {{minute: string, player: string, teamSide: string, ownGoal?: boolean, penalty?: boolean}} scorer
 * @param {{team1: string, team2: string, score?: {ft: [number, number]}}} fixture
 * @returns {{title: string, body: string}}
 */
function _formatGoalNotification(scorer, fixture) {
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

/**
 * 单次 sweep: 拉 fixtures → 算 eligible → 拉最新 scores → diff → 推 → 写盘.
 * 全部依赖注入, 纯 IO 都在 deps 跟 stateStore.
 * @param {number} now  epoch ms
 * @param {object} deps
 * @param {function} deps.refreshScores   async (keys) => { ok, scores, ... }
 * @param {function} deps.loadFixtures    () => { txt, ts } | null
 * @param {function} deps.onGoal          (notif, meta) => void
 * @param {function} [deps.onScoresChanged]  (newScores) => void  v2.22 C2.1
 * @param {object} deps.log              { info, warn, error }
 * @param {function} deps.onError         (err) => void
 * @param {string} [deps.statePath]      可选 state.json 路径 (测试用, 默认走 stateStore.defaultPath)
 * @returns {Promise<{notifiedCount: number, errors: string[]}>}
 */
async function _sweepOnce(now, deps) {
  const { refreshScores, loadFixtures, onGoal, onScoresChanged, log, onError, statePath } = deps;
  const errors = [];
  let notifiedCount = 0;

  try {
    // 1) fixtures cache
    const cached = loadFixtures();
    if (!cached || !cached.txt) {
      log.info("[goal-watcher] no fixtures cache, skip");
      return { notifiedCount: 0, errors: ["no_fixtures"] };
    }
    const fixturesData = parseWorldcupTxt(cached.txt);
    const allMatches = (fixturesData && fixturesData.matches) || [];

    // 2) eligibleKeys: 已开球 + 未过期 + 未 final stable
    const oldScoresCache = stateStore.loadWorldcupScores(statePath) || { entries: {} };
    const oldEntries = oldScoresCache.entries || {};
    const cutoffMs = now - MATCH_TOO_OLD_DAYS * 86400_000;
    const eligibleKeys = allMatches
      .filter((m) => isMatchStarted(m, now))
      .filter((m) => {
        const k = matchKickoffUtcMs(m);
        return k != null && k >= cutoffMs;
      })
      .filter((m) => {
        const e = oldEntries[matchKey(m)];
        if (e && e.status === "final" && Array.isArray(e.scorers) && e.scorers.length > 0) return false;
        return true;
      })
      .map(matchKey);

    if (eligibleKeys.length === 0) {
      return { notifiedCount: 0, errors: [] };
    }

    // 3) 拉最新
    const refresh = await refreshScores(eligibleKeys);
    if (!refresh || !refresh.ok) {
      log.warn("[goal-watcher] refresh failed", { reason: refresh && refresh.reason });
      return { notifiedCount: 0, errors: ["refresh_failed"] };
    }
    const newScores = refresh.scores || {};

    // v2.22 Task C2.1: 通知 tray (避免 60s 轮询).
    // 每次 sweep 完 (refreshScores 成功 + 至少 1 eligible key) 都 fire,
    // 跟 onGoal 独立 — 即使没进球也推. Tray 从 state.json.worldcup_scores 读,
    // 跟 refreshScores 写盘后的状态一致, 所以 cache 必然是 fresh 的.
    if (typeof onScoresChanged === "function") {
      try {
        // v2.51: 把 updatedKeys 附在 scores 对象上一起传, 让接收方 (renderer push)
        // 知道哪些 key 实际变了, 用于判断是否需要重算 bracket. 不破坏现有签名
        // (onScoresChanged 仍可只读 scores entries, 忽略 _updatedKeys).
        onScoresChanged({
          ...newScores,
          _updatedKeys: Array.isArray(refresh.updatedKeys)
            ? refresh.updatedKeys
            : [],
        });
      } catch (err) {
        log.warn("[worldcup/goal-watcher] onScoresChanged failed", {
          msg: err && err.message,
        });
      }
    }

    // 4) 读旧 notified
    const raw = stateStore.load(statePath) || {};
    const prevNotified = raw.worldcupGoalNotified || {};

    // 5) diff
    const newGoals = _diffNewGoals(oldEntries, newScores, prevNotified);
    if (newGoals.length === 0) {
      return { notifiedCount: 0, errors: [] };
    }

    // 6) 拼通知 + 调 onGoal
    const byKey = new Map(allMatches.map((m) => [matchKey(m), m]));
    const toNotify = newGoals.slice(0, MAX_NOTIFICATIONS_PER_SWEEP);
    const notifiedMap = new Map(); // matchKey → string[] (新 keys)

    for (const g of toNotify) {
      const fixture = byKey.get(g.matchKey);
      if (!fixture) continue;
      const fixtureWithScore = { ...fixture, score: newScores[g.matchKey] };
      const notif = _formatGoalNotification(g.scorer, fixtureWithScore);
      try {
        onGoal(notif, { matchKey: g.matchKey, scorer: g.scorer, fixture });
        if (!notifiedMap.has(g.matchKey)) notifiedMap.set(g.matchKey, []);
        notifiedMap.get(g.matchKey).push(g.key);
        notifiedCount += 1;
      } catch (err) {
        log.warn("[goal-watcher] onGoal failed", { msg: err.message });
        errors.push(`onGoal_failed:${g.matchKey}`);
      }
    }

    // 7) atomic write
    if (notifiedMap.size > 0) {
      try {
        stateStore.patchState((next) => {
          const prev = next.worldcupGoalNotified || {};
          const merged = { ...prev };
          for (const [mk, keys] of notifiedMap) {
            const existingKeys = (prev[mk] && prev[mk].notified) || [];
            merged[mk] = {
              notified: [...existingKeys, ...keys].slice(-MAX_GOAL_KEYS_PER_MATCH),
              updatedAt: now,
            };
          }
          next.worldcupGoalNotified = merged;
        }, statePath);
      } catch (err) {
        log.warn("[goal-watcher] state write failed", { msg: err.message });
        errors.push("state_write_failed");
      }
    }

    return { notifiedCount, errors };
  } catch (err) {
    if (typeof onError === "function") onError(err);
    return { notifiedCount, errors: [...errors, (err && err.message) || "unknown"] };
  }
}

// ── 调度 ─────────────────────────────────────────────────

let _sweepTimer = null;
let _onGoal = null;
let _deps = null;

/**
 * 启动 60s sweep. 第一次立即 _sweepOnce 一次 (拉启动前已在 live 的进球).
 * 重复调 → 先 stop 老的, 再起新的.
 * @param {object} deps
 * @param {function} deps.refreshScores
 * @param {function} deps.loadFixtures
 * @param {function} deps.onGoal
 * @param {function} [deps.onScoresChanged]  v2.22 C2.1, 透传到 _sweepOnce
 * @param {object} [deps.log]
 * @param {function} [deps.onError]
 * @param {number} [deps.now]   epoch ms, 注入便于测试; 默认 Date.now()
 */
function startGoalWatcher(deps) {
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

  // 启动时 sweep 一次
  _sweepOnce(now0, deps).catch((err) => {
    log.warn("[goal-watcher] initial sweep failed", { msg: err && err.message });
  });

  // 60s setInterval
  _sweepTimer = setInterval(() => {
    _sweepOnce(Date.now(), _deps || deps).catch((err) => {
      log.warn("[goal-watcher] sweep failed", { msg: err && err.message });
    });
  }, SWEEP_INTERVAL_MS);
  if (_sweepTimer && typeof _sweepTimer.unref === "function") {
    _sweepTimer.unref();
  }
}

function stopGoalWatcher() {
  if (_sweepTimer) {
    clearInterval(_sweepTimer);
    _sweepTimer = null;
  }
  _onGoal = null;
  _deps = null;
}

function isGoalWatcherRunning() {
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