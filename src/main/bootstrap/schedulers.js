/**
 * src/main/bootstrap/schedulers.js
 *
 * 启动期后台服务: FundScheduler + Reminders scheduler + Auto-check timer +
 * Recent activity listener. 失败 graceful.
 */

const { app, Notification: ElectronNotification } = require("electron");
const { mainLog } = require("../log");
const { resolveAppBundlePath } = require("../../utils/app-paths");
const { inQuietHours } = require("../notification-policy");
const stateStore = require("../state-store");
const { setManagedInterval, clearManaged } = require("../timer-registry");

// C4: 模块级 timer handle (跟 daily-summary-job 的 _handle 同构), 便于 __resetForTest 清理.
const _autoCheckHandle = { interval: null };

function __resetForTest() {
  if (_autoCheckHandle.interval) {
    clearManaged(_autoCheckHandle.interval);
    _autoCheckHandle.interval = null;
  }
}

/**
 * C4: 纯决策函数 — 判断本次 auto-check tick 应该 run 还是 skip.
 * 不读外部状态, 所有输入通过参数传入, 便于直接单测.
 *
 * @param {object}  args
 * @param {Date}    args.now
 * @param {string|null} args.quietStart  "HH:MM" 或 null
 * @param {string|null} args.quietEnd    "HH:MM" 或 null
 * @param {number|null} args.lastAutoCheckAt  epoch ms, null = 从未成功跑过
 * @param {number}  args.intervalMs
 * @returns {{action: 'run'} | {action: 'skip', reason: 'quiet_hours' | 'too_soon'}}
 */
function decideAutoCheck({ now, quietStart, quietEnd, lastAutoCheckAt, intervalMs }) {
  if (quietStart && quietEnd && inQuietHours(now, quietStart, quietEnd)) {
    return { action: "skip", reason: "quiet_hours" };
  }
  if (lastAutoCheckAt !== null && now.getTime() - lastAutoCheckAt < intervalMs) {
    return { action: "skip", reason: "too_soon" };
  }
  return { action: "run" };
}

/**
 * C4: 单次 tick 执行体. 决策 → 执行 → 更新 lastAutoCheckAt.
 * 抽出来便于单测; startAutoCheckTimer 的 timer 回调和 triggerNow 都调它.
 *
 * @param {object}  ctx
 * @param {object}  ctx.deps           startAutoCheckTimer 收到的 deps (含 runtimeConfigRef/pool/...)
 * @param {{lastAutoCheckAt: number|null}} ctx.state  可变状态对象 (闭包持有, 跨 tick 保持)
 * @param {number}  ctx.intervalMs
 * @param {function} [ctx.now]          注入当前时间, 测试用. 默认 () => new Date()
 * @param {function} [ctx.runCheck]     注入 runCheckQueued 的替代, 测试用.
 *                                       默认 require("../check-runner").runCheckQueued
 * @param {object}  [ctx.log]           注入 logger, 默认 mainLog
 */
async function checkOnce(ctx) {
  const { deps, state, intervalMs } = ctx;
  const nowFn = ctx.now || (() => new Date());
  const log = ctx.log || mainLog;
  const currentCfg = (deps.runtimeConfigRef && deps.runtimeConfigRef.current) || {};
  const qh = currentCfg.notifications || {};
  const now = nowFn();

  const decision = decideAutoCheck({
    now,
    quietStart: qh.quiet_hours_start,
    quietEnd: qh.quiet_hours_end,
    lastAutoCheckAt: state.lastAutoCheckAt,
    intervalMs,
  });

  if (decision.action === "skip") {
    log.info(`auto-check skipped (${decision.reason})`);
    return decision;
  }

  log.info("auto-check triggered");
  const runCheck =
    ctx.runCheck ||
    ((runDeps, opts) => require("../check-runner").runCheckQueued(runDeps, opts));
  try {
    await runCheck(
      {
        getConfig: () => deps.runtimeConfigRef.current,
        pool: deps.pool,
        getWindow: deps.getWindow,
        onCheckComplete: (results) => {
          if (deps.trayMgr) {
            deps.trayMgr.setResults(results);
            deps.trayMgr.setBadge(results.filter((r) => r.has_update).length);
          }
          try {
            deps.stateStore.saveAll(results);
          } catch (err) {
            log.warn(`state save failed: ${err.message}`);
          }
        },
      },
      { silent: true },
    );
    state.lastAutoCheckAt = Date.now();
    return { action: "run" };
  } catch (err) {
    log.warn(`auto-check failed: ${err && err.message}`);
    return { action: "error", error: err && err.message };
  }
}

/**
 * @param {object} deps
 * @param {object} deps.httpClient
 * @param {object} deps.fundStore
 * @param {object} deps.FundScheduler
 * @param {function} deps.sendToRenderer
 * @returns {object|null}
 */
function startFundScheduler(deps) {
  const { httpClient, fundStore, FundScheduler, sendToRenderer } = deps;
  try {
    const sched = new FundScheduler({
      httpClient,
      getCodes: () =>
        (fundStore.loadAll().holdings || []).map((h) => h.code).filter(Boolean),
      intervalMs: 5 * 60 * 1000,
      concurrency: 4,
      logger: mainLog,
    });
    sched.on("state", (st) => sendToRenderer("funds:nav:state", st));
    sched.on("fetched", (payload) => sendToRenderer("funds:nav:fetched", payload));
    sched.on("history", (payload) => sendToRenderer("funds:history:updated", payload));
    sched.start();
    mainLog.info("fund scheduler started");
    app.once("before-quit", () => {
      try {
        sched && sched.stop();
      } catch {
        /* noop */
      }
    });
    return sched;
  } catch (err) {
    mainLog.warn(`fund scheduler init failed: ${err && err.message}`);
    return null;
  }
}

/**
 * @param {object} deps
 * @param {object} deps.reminders
 * @param {function} deps.getWindow
 * @param {function} deps.sendToRenderer
 */
function startRemindersScheduler(deps) {
  const { reminders, getWindow, sendToRenderer } = deps;
  try {
    reminders.startScheduler({
      onFire: (r) => {
        try {
          if (ElectronNotification && ElectronNotification.isSupported()) {
            const n = new ElectronNotification({
              title: "Pulse 提醒",
              body: r.title,
              silent: false,
            });
            n.on("click", () => {
              try {
                const w = getWindow();
                if (w && !w.isDestroyed()) w.show();
                sendToRenderer("reminders:open-modal", { id: r.id });
              } catch {
                /* noop */
              }
            });
            n.show();
          }
        } catch (err) {
          mainLog.warn(
            `[reminders] notification show failed: ${err && err.message}`,
          );
        }
        sendToRenderer("reminders:fired", { id: r.id, reminder: r });
      },
    });
    mainLog.info("reminders scheduler started (30s sweep)");
    app.once("before-quit", () => {
      try {
        reminders.stopScheduler();
      } catch {
        /* noop */
      }
    });
  } catch (err) {
    mainLog.warn(`reminders scheduler init failed: ${err && err.message}`);
  }
}

/**
 * @param {object} deps
 * @param {object} deps.recentActivity
 * @param {function} deps.sendToRenderer
 */
function wireRecentActivityListener(deps) {
  const { recentActivity, sendToRenderer } = deps;
  try {
    recentActivity.setOnUpdate(() => {
      sendToRenderer("recent:updated", { entries: recentActivity.list() });
    });
  } catch (err) {
    mainLog.warn(`recent-activity onUpdate failed: ${err && err.message}`);
  }
}

/**
 * v2.16.0 世界杯进球通知 — 60s sweep + 系统通知.
 * 复用 refreshWorldcupScores / inQuietHours / Electron Notification.
 * @param {object} deps
 * @param {function} deps.getWindow
 * @param {function} deps.sendToRenderer
 * @param {function} deps.getConfig
 * @param {object} deps.goalWatcher
 * @param {function} [deps.onScoresChanged]  v2.22 C2.1 — goal-watcher 每次 sweep 完
 *   (refreshScores 成功) fire, 跟 onGoal 独立. 透传给 goalWatcher.startGoalWatcher.
 *   tray pushWorldcupToTray 走这里, 替换之前的 60s setInterval 兜底轮询.
 */
function startWorldcupGoalWatcher(deps) {
  const { getWindow, sendToRenderer, getConfig, goalWatcher, onScoresChanged } = deps;
  try {
    goalWatcher.startGoalWatcher({
      refreshScores: (keys) => require("../worldcup/scores-fetcher").refreshWorldcupScores(keys),
      loadFixtures: () => stateStore.loadWorldcupTxt(),
      onGoal: (notif, meta) => {
        try {
          // 复用现有 quiet hours
          const cfg = (typeof getConfig === "function" ? getConfig() : null) || {};
          const qh = (cfg.notifications) || {};
          const now = new Date();
          if (inQuietHours(now, qh.quiet_hours_start, qh.quiet_hours_end)) {
            mainLog.info(`[worldcup/goal-watcher] quiet hours skip: ${meta.matchKey}`);
            return;
          }
          if (!ElectronNotification.isSupported()) return;
          const n = new ElectronNotification({
            title: notif.title,
            body: notif.body,
            silent: false,
          });
          n.on("click", () => {
            try {
              const w = getWindow();
              if (w && !w.isDestroyed()) {
                w.show();
                w.focus();
              }
            } catch {
              /* noop */
            }
            try {
              sendToRenderer("worldcup:focus-match", { matchKey: meta.matchKey });
            } catch (err) {
              mainLog.warn(`[worldcup/goal-watcher] sendToRenderer failed: ${err && err.message}`);
            }
          });
          n.show();
        } catch (err) {
          mainLog.warn(
            `[worldcup/goal-watcher] notification show failed: ${err && err.message}`,
          );
        }
      },
      log: {
        info: (...args) => mainLog.info(...args),
        warn: (...args) => mainLog.warn(...args),
        error: (...args) => mainLog.error(...args),
      },
      // v2.22 C2.1: 透传 onScoresChanged (only if defined, 避免显式 undefined)
      ...(typeof onScoresChanged === "function" ? { onScoresChanged } : {}),
    });
    mainLog.info("worldcup goal watcher started (60s sweep)");
    app.once("before-quit", () => {
      try {
        goalWatcher.stopGoalWatcher();
      } catch {
        /* noop */
      }
    });
  } catch (err) {
    mainLog.warn(`worldcup goal watcher init failed: ${err && err.message}`);
  }
}

/**
 * Phase 16 / C4: 后台定时静默 check. C4 起: quiet hours 内跳过检测,
 * quiet hours 结束后补跑一次 (lastAutoCheckAt=null 语义). 顺带把 config
 * 取值从启动快照改为 runtimeConfigRef.current, 让 quiet hours 热生效.
 *
 * Public API (照搬 daily-summary-job 可测性模式):
 *   startAutoCheckTimer(deps) → { stop, triggerNow } | null
 *   __resetForTest()  // clear module-level timer handle between tests
 *
 * @param {object} deps
 * @param {object} deps.runtimeConfigRef   { current: config } 实时引用 (热重载)
 * @param {object} deps.pool
 * @param {function} deps.getWindow
 * @param {object} deps.trayMgr
 * @param {object} deps.stateStore
 * @param {function} [deps._testNow]       测试注入: 当前时间
 * @param {function} [deps._testRunCheck]  测试注入: runCheckQueued 替代
 */
function startAutoCheckTimer(deps) {
  const cfg = (deps.runtimeConfigRef && deps.runtimeConfigRef.current) || {};
  const rawInterval = cfg.notifications && cfg.notifications.check_interval_hours;
  // 注意: 不能用 `|| 6`, 否则 0 会被 falsy 吞成 6 (无法禁用). 显式区分 undefined/null.
  const checkIntervalHours = typeof rawInterval === "number" ? rawInterval : 6;
  if (checkIntervalHours <= 0) {
    mainLog.info("auto-check disabled (check_interval_hours = 0)");
    return null;
  }
  const AUTO_CHECK_INTERVAL_MS = checkIntervalHours * 60 * 60 * 1000;

  const ctxState = { lastAutoCheckAt: null };

  // C4: 把 deps 转成 checkOnce 需要的 ctx (单次构建, 跨 tick 复用闭包)
  const buildCtx = () => ({
    deps,
    state: ctxState,
    intervalMs: AUTO_CHECK_INTERVAL_MS,
    now: deps._testNow,
    runCheck: deps._testRunCheck,
  });

  if (_autoCheckHandle.interval) {
    clearManaged(_autoCheckHandle.interval);
  }
  _autoCheckHandle.interval = setManagedInterval(
    () => {
      checkOnce(buildCtx()).catch(() => {
        /* swallow — timer callback never throws */
      });
    },
    AUTO_CHECK_INTERVAL_MS,
    { label: "auto-check", file: "src/main/bootstrap/schedulers.js", line: 335 },
  );
  mainLog.info(`auto-check timer set: every ${checkIntervalHours}h`);
  if (app && typeof app.once === "function") {
    app.once("before-quit", () => {
      try {
        if (_autoCheckHandle.interval) clearManaged(_autoCheckHandle.interval);
      } catch {
        /* noop */
      }
    });
  }

  return {
    stop: () => {
      if (_autoCheckHandle.interval) {
        clearManaged(_autoCheckHandle.interval);
        _autoCheckHandle.interval = null;
      }
    },
    triggerNow: () => checkOnce(buildCtx()),
  };
}

/**
 * Phase 29: 每次 check 完成后后台 refresh last-opened + 推 renderer 事件.
 * 闭包持有 runtimeConfig + stateStore, 返回 fire-and-forget 调用器.
 * @param {object} deps
 * @param {object} deps.runtimeConfigRef   { current: object | null }
 * @param {object} deps.stateStore
 * @param {function} deps.sendToRenderer
 */
function makeRefreshLastOpenedAfterCheck(deps) {
  const { runtimeConfigRef, stateStore, sendToRenderer } = deps;
  return function refreshLastOpenedAfterCheck() {
    const cfg = runtimeConfigRef.current;
    const apps = (cfg && cfg.apps) || [];
    const refreshable = apps.filter((a) => a && a.name && a.bundle);
    if (refreshable.length === 0) return;
    (async () => {
      try {
        const lastOpened = require("../last-opened");
        const next = {};
        await Promise.all(
          refreshable.map(async (a) => {
            const bundlePath = resolveAppBundlePath(a.bundle);
            if (!bundlePath) {
              next[a.name] = { ms: null, source: "unknown" };
              return;
            }
            try {
              const r = await lastOpened.refreshOne(bundlePath);
              next[a.name] = { ms: r.ms, source: r.source };
            } catch (err) {
              mainLog.warn(
                `[last-opened] refresh item failed: ${a.name} ${err && err.message}`,
              );
              next[a.name] = { ms: null, source: "unknown" };
            }
          }),
        );
        stateStore.saveLastOpened(next);
        sendToRenderer("last-opened-updated", { lastOpened: next });
      } catch (err) {
        mainLog.warn(
          `[last-opened] batch refresh failed: ${err && err.message}`,
        );
      }
    })();
  };
}

module.exports = {
  decideAutoCheck,
  checkOnce,
  __resetForTest,
  startFundScheduler,
  startRemindersScheduler,
  startWorldcupGoalWatcher,
  wireRecentActivityListener,
  startAutoCheckTimer,
  makeRefreshLastOpenedAfterCheck,
};
