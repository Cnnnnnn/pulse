/**
 * src/main/bootstrap/schedulers.js
 *
 * 启动期后台服务: FundScheduler + Reminders scheduler + Auto-check timer +
 * Recent activity listener. 失败 graceful.
 */

const { app, Notification: ElectronNotification } = require("electron");
const { mainLog } = require("../log.ts");
const { resolveAppBundlePath } = require("../../utils/app-paths");
const { inQuietHours } = require("../notification-policy");
const stateStore = require("../state-store.ts");
const { buildRunCheckDeps } = require("../run-check-deps");
const { setManagedInterval, clearManaged } = require("../timer-registry.ts");
const aiLeaderboard = require("../ai-leaderboard");

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
function decideAutoCheck({
  now,
  quietStart,
  quietEnd,
  lastAutoCheckAt,
  intervalMs,
}) {
  if (quietStart && quietEnd && inQuietHours(now, quietStart, quietEnd)) {
    return { action: "skip", reason: "quiet_hours" };
  }
  if (
    lastAutoCheckAt !== null &&
    now.getTime() - lastAutoCheckAt < intervalMs
  ) {
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
  const currentCfg =
    (deps.runtimeConfigRef && deps.runtimeConfigRef.current) || {};
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
    ((runDeps, opts) =>
      require("../check-runner").runCheckQueued(runDeps, opts));
  try {
    await runCheck(
      {
        ...buildRunCheckDeps({
          runtimeConfigRef: deps.runtimeConfigRef,
          pool: deps.pool,
          getWindow: deps.getWindow,
          // auto-check 默认 silent, 不需要 onCheckComplete (它由 silent=false
          // 路径内部 scheduleOnCheckComplete 处理). 但 trayMgr.setResults +
          // saveAll 还是要在 check 完成后触发, 这里自定义一个组合包.
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
        }),
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
  const { httpClient, fundStore, FundScheduler, sendToRenderer, getConfig } =
    deps;
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
    sched.on("fetched", (payload) => {
      sendToRenderer("funds:nav:fetched", payload);
      try {
        const { checkFundAlerts } = require("../funds/fund-alerts");
        const all = fundStore.loadAll();
        const cfg = typeof getConfig === "function" ? getConfig() || {} : {};
        const notif = cfg.notifications || {};
        const sendNotification = (n) => {
          if (
            notif.quiet_hours_start &&
            notif.quiet_hours_end &&
            inQuietHours(
              new Date(),
              notif.quiet_hours_start,
              notif.quiet_hours_end,
            )
          ) {
            return;
          }
          if (
            !ElectronNotification.isSupported ||
            !ElectronNotification.isSupported()
          ) {
            return;
          }
          new ElectronNotification({
            title: n.title,
            body: n.body,
            silent: false,
          }).show();
        };
        const alertOut = checkFundAlerts({
          holdings: all.holdings,
          navMap: (payload && payload.results) || {},
          alertPrefs: all.alertPrefs,
          navSource: all.navSource,
          sendNotification,
          saveAlertPrefs: (patch) => fundStore.setAlertPrefs(patch),
          log: mainLog,
        });
        if (alertOut && alertOut.notified > 0) {
          sendToRenderer("sidenav:badge", {
            key: "funds",
            count: alertOut.notified,
          });
        }
        const {
          checkWatchlistFundUpdates,
          makeWatchlistSendNotification,
        } = require("../watchlist");
        checkWatchlistFundUpdates({
          navMap: (payload && payload.results) || {},
          navSource: all.navSource,
          sendNotification: makeWatchlistSendNotification(getConfig),
        });
      } catch (err) {
        mainLog.warn(
          `[fund-scheduler] alert check failed: ${err && err.message}`,
        );
      }
    });
    sched.on("history", (payload) =>
      sendToRenderer("funds:history:updated", payload),
    );
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

// ---- P52: Pulse 自更新 ----

/**
 * P52: 自更新 controller (事件订阅 + 状态机 reducer + quitAndInstall).
 *
 * 输入 deps.autoUpdater (electron-updater 的 autoUpdater 单例), 输出 controller:
 *   - controller.getState()     返回当前 update state
 *   - controller.checkNow()     立即触发 checkForUpdates
 *   - controller.quitAndInstall() 退出并安装已下载的更新
 *
 * 半自动档: 检测 + 自动下载 + 提示手动确认安装. 不自动 quitAndInstall.
 *
 * 本函数是接线层, 不可单测 (依赖 electron-updater 运行时).
 * 状态转换走 src/main/self-updater.js 的 reduceUpdateState 纯函数, 那里有单测.
 *
 * @param {object} deps
 * @param {object} deps.autoUpdater  electron-updater autoUpdater (测试可注入 mock)
 * @returns {{
 *   getState: () => object,
 *   checkNow: () => Promise<{ok: boolean, reason?: string}>,
 *   quitAndInstall: () => void,
 * }}
 */
function makeSelfUpdateController(deps) {
  const { autoUpdater } = deps || {};
  const {
    INITIAL_UPDATE_STATE,
    reduceUpdateState,
  } = require("../self-updater");
  let state = { ...INITIAL_UPDATE_STATE };

  function dispatch(action) {
    state = reduceUpdateState(state, action);
  }

  if (!autoUpdater || typeof autoUpdater.checkForUpdates !== "function") {
    return {
      getState: () => state,
      checkNow: async () => ({ ok: false, reason: "no-autoUpdater" }),
      quitAndInstall: () => {
        /* noop */
      },
    };
  }

  // 半自动档配置
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
  } catch {
    /* mock 可能只读 — ignore */
  }

  // 事件 → dispatch
  try {
    autoUpdater.on("checking-for-update", () => dispatch({ type: "CHECKING" }));
    autoUpdater.on("update-available", (info) =>
      dispatch({
        type: "UPDATE_AVAILABLE",
        version: info && info.version,
        releaseNotes:
          (info && info.releaseNotes) ||
          (info && typeof info.releaseNotes === "string"
            ? info.releaseNotes
            : null),
      }),
    );
    autoUpdater.on("update-not-available", () =>
      dispatch({ type: "UPDATE_NOT_AVAILABLE" }),
    );
    autoUpdater.on("download-progress", (p) =>
      dispatch({
        type: "DOWNLOAD_PROGRESS",
        percent:
          p && typeof p.percent === "number" ? Math.round(p.percent) : null,
      }),
    );
    autoUpdater.on("update-downloaded", () =>
      dispatch({ type: "UPDATE_DOWNLOADED" }),
    );
    autoUpdater.on("error", (err) =>
      dispatch({ type: "ERROR", message: (err && err.message) || String(err) }),
    );
  } catch {
    /* mock 没 on — 不订阅, 不阻断 */
  }

  return {
    getState: () => state,
    checkNow: async () => {
      try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
      } catch (err) {
        dispatch({
          type: "ERROR",
          message: (err && err.message) || String(err),
        });
        return { ok: false, reason: "threw", error: err && err.message };
      }
    },
    quitAndInstall: () => {
      try {
        if (typeof autoUpdater.quitAndInstall === "function") {
          autoUpdater.quitAndInstall();
        }
      } catch {
        /* noop */
      }
    },
  };
}

/**
 * P52: 启动自更新检测. 复用 setManagedInterval 范式, 启动时延迟 30s 检测一次 + 每 6h 复检.
 * 半自动档: 检测 + 下载, 不自动 quitAndInstall (等用户在 UI 点安装).
 *
 * @param {object} [deps]
 * @param {object} [deps.autoUpdater]   测试注入; 默认 require("electron-updater")
 * @param {number}  [deps.intervalMs]   默认 6h
 * @returns {{
 *   stop: () => void,
 *   triggerNow: () => Promise<{ok: boolean, reason?: string}>,
 *   controller: ReturnType<typeof makeSelfUpdateController>,
 * } | null}
 */
function startSelfUpdateTimer(deps = {}) {
  const intervalMs =
    typeof deps.intervalMs === "number" && deps.intervalMs > 0
      ? deps.intervalMs
      : 6 * 60 * 60 * 1000;

  let autoUpdater = deps.autoUpdater;
  if (!autoUpdater) {
    try {
       
      const mod = require("electron-updater");
      autoUpdater = mod.autoUpdater;
    } catch (err) {
      mainLog.warn(
        `[self-update] electron-updater not available: ${err && err.message}`,
      );
      // 降级: 返一个 "未启用" controller, IPC 仍能注册但 checkNow 返 no-autoUpdater
      const controller = makeSelfUpdateController({});
      return {
        stop: () => {},
        triggerNow: async () => ({ ok: false, reason: "no-autoUpdater" }),
        controller,
      };
    }
  }

  const controller = makeSelfUpdateController({ autoUpdater });

  // P52 §增量自更新: 6h 周期 tick 仅在 idle 跑. 启动检测 + 手动 trigger 不受限.
  // 决策跟 detector-chain-incremental 同款范式 (纯函数 + 接线层).
  let bootStartedAt = Date.now();
  let getPowerIdleState =
    typeof deps.getPowerIdleState === "function"
      ? deps.getPowerIdleState
      : () => null;
  let logSkip =
    typeof deps.logSkip === "function"
      ? deps.logSkip
      : (reason) => mainLog.info(`self-update tick skipped (${reason})`);
  const { decideSelfUpdateTick } = require("../self-update-idle");

  // 幂等 powerMonitor 查询: 接线层提供 getPowerIdleState fn,
  // 测试注入 mock, 生产接 electron.powerMonitor.getSystemIdleState.
  // 任何异常 → 返 null (纯函数把 null 当 "unknown" 处理, 不阻断但也不强跑).
  function safeGetPowerIdleState(fn) {
    try {
      const r = fn();
      if (r === "active" || r === "idle" || r === "locked" || r === "unknown") {
        return r;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function checkOnce() {
    return controller.checkNow();
  }

  // setManagedInterval 范式 (参考 startAutoCheckTimer)
  let intervalHandle = null;
  try {
    intervalHandle = setManagedInterval(
      () => {
        const decision = decideSelfUpdateTick({
          bootStartedAt,
          now: Date.now(),
          powerIdleState: safeGetPowerIdleState(getPowerIdleState),
        });
        if (decision.action === "skip") {
          logSkip(decision.reason);
          return;
        }
        checkOnce().catch(() => {
          /* swallow */
        });
      },
      intervalMs,
      {
        label: "self-update",
        file: "src/main/bootstrap/schedulers.js",
        line: 0,
      },
    );
    mainLog.info(
      `self-update timer set: every ${Math.round(intervalMs / 60000)}min (idle-gated)`,
    );
  } catch (err) {
    mainLog.warn(
      `[self-update] setManagedInterval failed: ${err && err.message}`,
    );
  }

  // 启动时延迟 30s 检测一次 (避免跟启动 check 抢资源)
  let initialTimer = null;
  try {
    initialTimer = setTimeout(() => {
      checkOnce().catch(() => {});
    }, 30000);
  } catch {
    /* noop */
  }

  if (app && typeof app.once === "function") {
    app.once("before-quit", () => {
      try {
        if (intervalHandle) clearManaged(intervalHandle);
      } catch {
        /* noop */
      }
      try {
        if (initialTimer) clearTimeout(initialTimer);
      } catch {
        /* noop */
      }
    });
  }

  return {
    stop: () => {
      try {
        if (intervalHandle) clearManaged(intervalHandle);
      } catch {
        /* noop */
      }
      try {
        if (initialTimer) clearTimeout(initialTimer);
      } catch {
        /* noop */
      }
      intervalHandle = null;
      initialTimer = null;
    },
    triggerNow: checkOnce,
    controller,
  };
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
// 2026 世界杯已于 2026-07-19 结束。赛事结束后不再轮询外部 API（tray/digest
// 的数据源已有日期过滤，不会显示过期比赛）。如需支持下届赛事，更新此日期。
const WORLDCUP_2026_END_MS = Date.UTC(2026, 6, 20); // 7月20日 00:00 UTC（决赛次日）
function startWorldcupGoalWatcher(deps) {
  if (Date.now() >= WORLDCUP_2026_END_MS) return; // 赛事已结束，不启动后台轮询
  const { getWindow, sendToRenderer, getConfig, goalWatcher, onScoresChanged } =
    deps;
  try {
    goalWatcher.startGoalWatcher({
      refreshScores: (keys) =>
        require("../worldcup/scores-fetcher").refreshWorldcupScores(keys),
      loadFixtures: () => stateStore.loadWorldcupTxt(),
      onGoal: (notif, meta) => {
        try {
          // 复用现有 quiet hours
          const cfg =
            (typeof getConfig === "function" ? getConfig() : null) || {};
          const qh = cfg.notifications || {};
          const now = new Date();
          if (inQuietHours(now, qh.quiet_hours_start, qh.quiet_hours_end)) {
            mainLog.info(
              `[worldcup/goal-watcher] quiet hours skip: ${meta.matchKey}`,
            );
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
              sendToRenderer("worldcup:focus-match", {
                matchKey: meta.matchKey,
              });
            } catch (err) {
              mainLog.warn(
                `[worldcup/goal-watcher] sendToRenderer failed: ${err && err.message}`,
              );
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
  const rawInterval =
    cfg.notifications && cfg.notifications.check_interval_hours;
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
    {
      label: "auto-check",
      file: "src/main/bootstrap/schedulers.js",
      line: 335,
    },
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
  startSelfUpdateTimer,
  makeSelfUpdateController,
  startLeaderboardScheduler,
};

/**
 * AI 榜单每日同步调度（graceful；失败不阻断启动）。
 * 复用 ai-leaderboard 模块导出的 registerLeaderboardScheduler（封装 setManagedInterval），
 * 启动延迟预暖 + before-quit 清理。
 * @param {object} [deps]
 * @returns {{start:function, stop:function, triggerNow:function}|null}
 */
function startLeaderboardScheduler(deps) {
  try {
    const handle = aiLeaderboard.registerLeaderboardScheduler(deps || {});
    handle.start();
    if (app && typeof app.once === "function") {
      app.once("before-quit", () => {
        try {
          handle.stop();
        } catch {
          /* noop */
        }
      });
    }
    return handle;
  } catch (err) {
    mainLog.warn(`[ai-leaderboard] scheduler init failed: ${err && err.message}`);
    return null;
  }
}
