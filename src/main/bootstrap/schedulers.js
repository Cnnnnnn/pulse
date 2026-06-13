/**
 * src/main/bootstrap/schedulers.js
 *
 * 启动期后台服务: FundScheduler + Reminders scheduler + Auto-check timer +
 * Recent activity listener. 失败 graceful.
 */

const { app, Notification: ElectronNotification } = require("electron");
const { mainLog } = require("../log");
const { runCheckQueued } = require("../check-runner");
const { resolveAppBundlePath } = require("../../utils/app-paths");

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
 * Phase 16: 后台定时静默 check — 打破"开 app 才检查"局限.
 * @param {object} deps
 * @param {object|null} deps.runtimeConfig
 * @param {object} deps.pool
 * @param {function} deps.getWindow
 * @param {object} deps.trayMgr
 * @param {object} deps.stateStore
 */
function startAutoCheckTimer(deps) {
  const { runtimeConfig, pool, getWindow, trayMgr, stateStore } = deps;
  const checkIntervalHours =
    (runtimeConfig &&
      runtimeConfig.notifications &&
      runtimeConfig.notifications.check_interval_hours) ||
    6;
  if (checkIntervalHours <= 0) {
    mainLog.info(
      "auto-check disabled (notifications.check_interval_hours = 0)",
    );
    return;
  }
  const AUTO_CHECK_INTERVAL_MS = checkIntervalHours * 60 * 60 * 1000;
  const autoCheckTimer = setInterval(() => {
    mainLog.info(`auto-check triggered (${checkIntervalHours}h)`);
    runCheckQueued(
      {
        getConfig: () => runtimeConfig,
        pool,
        getWindow,
        onCheckComplete: (results) => {
          if (trayMgr) {
            trayMgr.setResults(results);
            const count = results.filter((r) => r.has_update).length;
            trayMgr.setBadge(count);
          }
          try {
            stateStore.saveAll(results);
          } catch (err) {
            mainLog.warn(`state save failed: ${err.message}`);
          }
        },
      },
      { silent: true },
    ).catch((err) => {
      mainLog.warn(`auto-check failed: ${err && err.message}`);
    });
  }, AUTO_CHECK_INTERVAL_MS);
  mainLog.info(`auto-check timer set: every ${checkIntervalHours}h`);
  app.once("before-quit", () => {
    try {
      clearInterval(autoCheckTimer);
    } catch {
      /* noop */
    }
  });
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
  startFundScheduler,
  startRemindersScheduler,
  wireRecentActivityListener,
  startAutoCheckTimer,
  makeRefreshLastOpenedAfterCheck,
};
