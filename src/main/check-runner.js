/**
 * src/main/check-runner.js
 *
 * Phase 16: 抽出 check 逻辑, 让 IPC handler 和后台定时器共用.
 * Phase 27: 通知 dispatch 时跳过 muted apps.
 *
 * 入口: runCheck(ctx, { silent })
 *   - silent=false (默认, IPC 调用): 推 check-started/finished 事件, 发系统通知
 *   - silent=true (后台定时): 静默, 只更新 state + tray/badge + 发 auto-check-finished
 *
 * 依赖 (从 index.js 注入):
 *   - getConfig()  → 读 appCfg 列表
 *   - pool         → 跑 detect-app task
 *   - getWindow()  → 推事件给 renderer
 *   - onCheckComplete(results) → 推给 tray/badge + state-store
 */

const { Notification: ElectronNotification } = require("electron");
const { inQuietHours, suppressedByCooldown } = require("./notification-policy");
const { isMuteActive } = require("./state-store");
const { applySnoozeFilter } = require("./snooze");
const recentActivity = require("./recent-activity");
const { detectStaleApps } = require("../utils/stale-detect");

const PER_APP_DETECT_TIMEOUT_MS = 95_000;

function scheduleOnCheckComplete(fn, results, staleNames) {
  if (typeof fn !== "function") return;
  setImmediate(() => {
    try {
      fn(results, staleNames);
    } catch {
      /* noop */
    }
  });
}

function enqueueDetectApp(pool, appCfg, history, incremental) {
  const job = pool.enqueue({
    type: "detect-app",
    payload: {
      appCfg: {
        ...appCfg,
        changelog_history: Array.isArray(history) ? history : [],
      },
      incremental: incremental || null,
    },
  });
  return Promise.race([
    job,
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `detect-app timeout: ${(appCfg && appCfg.name) || "unknown"}`,
            ),
          ),
        PER_APP_DETECT_TIMEOUT_MS,
      );
    }),
  ]);
}

/**
 * @param {object} deps
 * @param {object} deps.getConfig
 * @param {object} deps.pool
 * @param {object} deps.getWindow
 * @param {object} deps.onCheckComplete
 * @param {object} [deps.getState]          () => state object (含 last_notified, mutes)
 * @param {object} [deps.markNotified]     (names: string[]) => void   写 state
 * @param {object} [deps.Notification]      测试用: 注入 Notification 构造器. 默认 = electron.Notification
 * @param {object} [opts]
 * @param {boolean} [opts.silent=false]  true = 后台自动 check, 不打扰用户
 * @returns {Promise<Array>} results
 */
async function runCheck(deps, opts = {}) {
  const {
    getConfig,
    pool,
    getWindow,
    onCheckComplete,
    getState,
    markNotified,
    Notification: NotificationCtor,
  } = deps;
  const Notification = NotificationCtor || ElectronNotification;
  const silent = !!opts.silent;
  const config = getConfig() || { apps: [] };
  const apps = config.apps || [];
  const notifCfg = (config && config.notifications) || {};
  const quietStart = notifCfg.quiet_hours_start;
  const quietEnd = notifCfg.quiet_hours_end;
  const cooldownMs =
    typeof notifCfg.cooldown_hours === "number" && notifCfg.cooldown_hours > 0
      ? notifCfg.cooldown_hours * 60 * 60 * 1000
      : 0; // 0 = 不限制

  function sendToRenderer(channel, payload) {
    const w = getWindow && getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }

  if (!silent) {
    sendToRenderer("check-started", { count: apps.length, ts: Date.now() });
  }

  // 队列化: 每个 app 一个 detect-app task (带主进程侧超时, 防止 worker 挂死占满 pool)
  const stateApps =
    (typeof getState === "function" && getState() && getState().apps) || {};
  // C5: 构造 appsLastChecked map, 让 worker 用作"最近 7d 已检测过"判定.
  // silent=true (后台自动) 用增量模式; silent=false (用户手动) 全链刷新.
  const appsLastChecked = {};
  for (const [name, app] of Object.entries(stateApps)) {
    if (app && typeof app.ts === "number") appsLastChecked[name] = app.ts;
  }
  const incrementalPayload = silent ? { appsLastChecked, recentDays: 7 } : null;
  const tasks = apps.map((appCfg) => {
    const history =
      appCfg && appCfg.name && stateApps[appCfg.name]
        ? stateApps[appCfg.name].changelog_history
        : undefined;
    return enqueueDetectApp(pool, appCfg, history, incrementalPayload);
  });
  const settled = await Promise.allSettled(tasks);
  const results = settled.map((s, i) => {
    if (s.status === "fulfilled" && s.value) {
      return s.value;
    }
    const appCfg = apps[i] || {};
    return {
      name: appCfg.name || `app-${i}`,
      installed_version: null,
      latest_version: null,
      has_update: false,
      status: "error",
      source: "",
      note: (s.reason && s.reason.message) || "task failed",
      bundle: appCfg.bundle || "",
    };
  });

  // 落盘 + tray/badge (在 check-finished 之后, 避免 saveAll 阻塞 UI 结束态)
  // stale 提示: 7 天没新结果的 app, 推到 tray 显示 + 留 hook 给后续 "全链重跑" 用
  const { staleNames, freshestTs } = detectStaleApps(stateApps, Date.now());
  const finishPayload = {
    count: results.length,
    ts: Date.now(),
    stale: staleNames,
    freshestTs,
  };

  // Phase C2: load state + apply snooze filter up front, so both silent / non-silent
  // branches (and the final return) see consistent filtered results.
  const state = typeof getState === "function" ? getState() : null;
  // Phase C2: snoozed apps lose has_update (badge / tray / notification skip).
  // applySnoozeFilter returns a NEW array, so the original `results` is preserved
  // for callers that may inspect raw detection output; downstream consumers here
  // all use `filteredResults`.
  const filteredResults = applySnoozeFilter(results, state, Date.now());

  // 系统通知: silent 时不发
  if (!silent) {
    try {
      recentActivity.push({
        kind: "app-check",
        ref: "versions-check",
        label: `检查了 ${results.length} 个应用`,
      });
    } catch {
      /* noop */
    }

    const updateApps = filteredResults.filter((r) => r.has_update);

    // Phase 17: Quiet hours 抑制
    if (inQuietHours(new Date(), quietStart, quietEnd)) {
      sendToRenderer("check-finished", finishPayload);
      scheduleOnCheckComplete(onCheckComplete, filteredResults);
      return filteredResults;
    }

    const suppressed = new Set(
      suppressedByCooldown(updateApps, state, cooldownMs),
    );
    let notifyable = updateApps.filter((r) => !suppressed.has(r.name));

    const mutes = (state && state.mutes) || {};
    const now = Date.now();
    notifyable = notifyable.filter((r) => !isMuteActive(mutes[r.name], now));

    sendToRenderer("check-finished", finishPayload);
    scheduleOnCheckComplete(onCheckComplete, filteredResults, finishPayload.stale);

    if (notifyable.length > 0) {
      const names = notifyable.map((r) => r.name).join("、");
      try {
        new Notification({
          title: "Pulse",
          body: `${notifyable.length} 个应用有更新：${names}`,
          silent: false,
        }).show();
      } catch {
        /* notification 不可用时静默 */
      }
      if (typeof markNotified === "function") {
        try {
          markNotified(notifyable.map((r) => r.name));
        } catch {
          /* noop */
        }
      }
    }
  } else {
    scheduleOnCheckComplete(onCheckComplete, filteredResults, finishPayload.stale);
    sendToRenderer("auto-check-finished", finishPayload);
  }

  return filteredResults;
}

/** 串行化 check, 避免手动/自动检查同时占满 worker pool */
let checkTail = Promise.resolve();
let manualCheckInflight = null;

function runCheckQueued(deps, opts = {}) {
  const silent = !!opts.silent;
  if (!silent && manualCheckInflight) {
    return manualCheckInflight;
  }
  const job = checkTail.then(() => {
    const running = runCheck(deps, opts);
    if (!silent) manualCheckInflight = running;
    return running.finally(() => {
      if (!silent && manualCheckInflight === running) {
        manualCheckInflight = null;
      }
    });
  });
  checkTail = job.catch(() => {});
  return job;
}

module.exports = { runCheck, runCheckQueued };
