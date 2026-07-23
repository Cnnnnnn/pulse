/**
 * src/main/check-runner.ts
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
const { isMuteActive } = require("./state-store.ts");
const recentActivity = require("./recent-activity");
const { detectStaleApps } = require("../utils/stale-detect");

const PER_APP_DETECT_TIMEOUT_MS = 95_000;

type ScheduleFn = (results: unknown, staleNames?: unknown) => void;

function scheduleOnCheckComplete(fn: ScheduleFn | undefined, results: unknown, staleNames?: unknown): void {
  if (typeof fn !== "function") return;
  setImmediate(() => {
    try {
      fn(results, staleNames);
    } catch {
      /* noop */
    }
  });
}

function enqueueDetectApp(pool: any, appCfg: any, history: any, incremental: any, forceRefresh: boolean) {
  const job = pool.enqueue({
    type: "detect-app",
    payload: {
      appCfg: {
        ...appCfg,
        changelog_history: Array.isArray(history) ? history : [],
      },
      incremental: incremental || null,
      // 手动刷新 (silent=false) 时 forceRefresh=true → 下游绕过熔断冷却,
      // 强制重试权威源. 后台自动 check 不强制, 仍走熔断保护.
      forceRefresh: !!forceRefresh,
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

export type RunCheckDeps = {
  getConfig: () => any;
  pool: any;
  getWindow: () => any;
  onCheckComplete: ScheduleFn;
  getState?: () => any;
  markNotified?: (names: string[]) => void;
  Notification?: any;
};

export type RunCheckOpts = {
  silent?: boolean;
};

export async function runCheck(deps: RunCheckDeps, opts: RunCheckOpts = {}): Promise<any[]> {
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

  function sendToRenderer(channel: string, payload: unknown) {
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
  const appsLastChecked: Record<string, number> = {};
  for (const [name, app] of Object.entries(stateApps as Record<string, any>)) {
    if (app && typeof app.ts === "number") appsLastChecked[name] = app.ts;
  }
  const incrementalPayload = silent ? { appsLastChecked, recentDays: 7 } : null;
  // 手动刷新 (silent=false) 强制绕过熔断冷却重试权威源; 后台自动 check 不强制.
  const forceRefreshPayload = !silent;
  const tasks = apps.map((appCfg: any) => {
    const history =
      appCfg && appCfg.name && stateApps[appCfg.name]
        ? stateApps[appCfg.name].changelog_history
        : undefined;
    return enqueueDetectApp(
      pool,
      appCfg,
      history,
      incrementalPayload,
      forceRefreshPayload,
    );
  });
  const settled = await Promise.allSettled(tasks);
  const results = settled.map((s, i) => {
    if (s.status === "fulfilled" && (s as any).value) {
      return (s as any).value;
    }
    const appCfg = apps[i] || {};
    return {
      name: appCfg.name || `app-${i}`,
      installed_version: null,
      latest_version: null,
      has_update: false,
      status: "error",
      source: "",
      note: ((s as any).reason && (s as any).reason.message) || "task failed",
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

  const state = typeof getState === "function" ? getState() : null;
  const filteredResults = results;

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

    const updateApps = filteredResults.filter((r: any) => r.has_update);

    // Phase 17: Quiet hours 抑制
    if (inQuietHours(new Date(), quietStart, quietEnd)) {
      sendToRenderer("check-finished", finishPayload);
      scheduleOnCheckComplete(onCheckComplete, filteredResults);
      return filteredResults;
    }

    const suppressed = new Set(
      suppressedByCooldown(updateApps, state, cooldownMs),
    );
    let notifyable = updateApps.filter((r: any) => !suppressed.has(r.name));

    const mutes = (state && state.mutes) || {};
    const now = Date.now();
    notifyable = notifyable.filter((r: any) => !isMuteActive(mutes[r.name], now));

    sendToRenderer("check-finished", finishPayload);
    scheduleOnCheckComplete(
      onCheckComplete,
      filteredResults,
      finishPayload.stale,
    );

    if (notifyable.length > 0) {
      const names = notifyable.map((r: any) => r.name).join("、");
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
          markNotified(notifyable.map((r: any) => r.name));
        } catch {
          /* noop */
        }
      }
    }
  } else {
    scheduleOnCheckComplete(
      onCheckComplete,
      filteredResults,
      finishPayload.stale,
    );
    sendToRenderer("auto-check-finished", finishPayload);
  }

  return filteredResults;
}

/** 串行化 check, 避免手动/自动检查同时占满 worker pool */
let checkTail: Promise<any> = Promise.resolve();
let manualCheckInflight: Promise<any[]> | null = null;

export type RunCheckQueuedResult = { started: boolean; reason?: string };

export function runCheckQueued(deps: RunCheckDeps, opts: RunCheckOpts = {}): Promise<RunCheckQueuedResult | any[]> {
  const silent = !!opts.silent;
  if (!silent && manualCheckInflight) {
    // 手动并发点击 → 直接告知调用方正在跑, 不要拿同一条 in-flight promise
    // 让 caller 误以为成功 (会跟真正的 started:true 行为一样, 但其实是复用
    // 上一次的结果). 2026-06-28 「点了检查更新无反应」 同类问题: 调用方拿到
    // in-flight promise, 等了 N 秒才发现 UI 没新数据.
    return Promise.resolve({ started: false, reason: "already_running" });
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