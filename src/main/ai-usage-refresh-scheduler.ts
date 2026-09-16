/**
 * src/main/ai-usage-refresh-scheduler.ts
 *
 * v2.22 Task B2.1: 30-min AI 用量 tray 自动刷新.
 *
 * 设计:
 *   - createAiUsageRefreshScheduler({trayMgr, deps}) 工厂
 *   - refreshOnce(): 双 provider (minimax + glm) 并发 fetch, 失败软处理
 *   - start({intervalMs}): 启 setInterval, 首次立即 fire
 *   - stop(): clearInterval (幂等, 可重复调)
 *   - 复用 register-ai-usage 的 _internals.fetch (deps 注入)
 *   - 复用 ai-usage-cache 的 getTraySummary 构造 tray summary
 */
import * as registerAiUsage from "./ipc/register-ai-usage";
import { PROVIDERS } from "./ai-usage-cache";
import { decideAuthReminder } from "../ai-usage/auth-watch";
import { inQuietHours } from "./notification-policy";
import { Notification as ElectronNotification } from "electron";

const { setManagedInterval, clearManaged } = require("./timer-registry.ts");

/**
 * 「登录态失效, 去终端重新登录」提醒.
 *
 * 决策是纯函数 (`ai-usage/auth-watch.decideAuthReminder`), 这里只做 I/O:
 * 读历史快照判断"是否曾经能用" + 落去重时间戳 + 发通知.
 *
 * 只对 codex 生效 —— minimax/glm 是 API key, 失效时 UI 里换个 key 就行, 不值得弹系统通知.
 *
 * @returns {number} 本次提醒条数 (0 或 1), 给 badge 用
 */
function _runAuthReminder(
  results: any[],
  actualDeps: any,
  alertDeps: any,
  // 返回是否真的发出去了 (静默时段 / 系统不支持 → false)
  sendNotification: (n: any) => boolean | void,
): number {
  const hadSnapshot: Record<string, boolean> = {};
  for (const pid of PROVIDERS) {
    try {
      hadSnapshot[pid] = Boolean(
        actualDeps?.stateStore?.loadSnapshotProvider?.(pid),
      );
    } catch {
      hadSnapshot[pid] = false;
    }
  }

  const decision = decideAuthReminder({
    results,
    prefs: typeof alertDeps.loadAlertPrefs === "function"
      ? alertDeps.loadAlertPrefs()
      : null,
    hadSnapshot,
  });

  // 只有"该发且真的发出去了"才记已提醒 —— 被静默时段吞掉的不能算已读,
  // 否则用户永远等不到那条提醒. 纯恢复 patch (无 notification) 无条件落盘,
  // 否则下次失效不会再提醒.
  let delivered = true;
  if (decision.notification) {
    delivered = sendNotification(decision.notification) !== false;
  }
  if (
    decision.patch &&
    delivered &&
    typeof alertDeps.saveAlertPrefs === "function"
  ) {
    alertDeps.saveAlertPrefs(decision.patch);
  }
  return decision.notification && delivered ? 1 : 0;
}

export function createAiUsageRefreshScheduler(opts: any = {}): any {
  const trayMgr = opts.trayMgr;
  const deps = opts.deps;
  const getConfig =
    typeof opts.getConfig === "function" ? opts.getConfig : null;
  const alertDeps = opts.alertDeps || null;
  const sendToRenderer =
    typeof opts.sendToRenderer === "function" ? opts.sendToRenderer : null;

  let intervalHandle: any = null;
  let stopped = false;

  function _buildEmptyDeps(): any {
    // 如果用户没传 deps, 我们就调 _internals.fetch 但它需要 deps.
    // 真实生产代码必须传. 这里是 fallback: 用空 deps 让 fetch 走 'api_key_missing'
    // 路径 (catch 住). 这是为了不抛, 允许 refresh 周期继续.
    return (
      deps || {
        stateStore: {
          loadSnapshotProvider: () => null,
          saveSnapshotProvider: () => {},
          loadHistoryProvider: () => null,
          appendHistoryProvider: () => {},
        },
        storage: { loadApiKey: () => null },
        MiniMaxQuotaClient: null,
        GlmQuotaClient: null,
        CodexQuotaClient: null,
        pushEvent: () => {},
      }
    );
  }

  async function refreshOnce(): Promise<void> {
    const actualDeps = _buildEmptyDeps();
    const fetchPromises = PROVIDERS.map((pid: string) =>
      registerAiUsage._internals
        .fetch({ deps: actualDeps, opts: { provider: pid } })
        .catch((err: any) => ({
          ok: false,
          provider: pid,
          reason: "exception",
          error: err && err.message,
        })),
    );
    // wait all, ignore individual failures (we don't block)
    const settled = await Promise.allSettled(fetchPromises);
    // 保留本轮结果 — 登录态提醒要用 (每个 fetch 自己 catch 过, 正常都是 fulfilled)
    const results: any[] = settled.map((s: any) =>
      s.status === "fulfilled" ? s.value : { ok: false, reason: "exception" },
    );
    // Now push to tray (state.json was updated by successful fetches)
    if (trayMgr && typeof trayMgr.setAiUsage === "function") {
      try {
        const { createAiUsageCache } = require("./ai-usage-cache.ts");
        const cache = createAiUsageCache({});
        trayMgr.setAiUsage(cache.getTraySummaryMap());
      } catch (err: any) {
        // swallow — tray update failure should not kill the loop
      }
    }

    if (alertDeps) {
      try {
        const { checkAiUsageAlerts } = require("./ai-usage-alerts.ts");
        // 返回 boolean: 是否真的发出去了. 静默时段/系统不支持时返 false ——
        // 登录态提醒据此决定"要不要记下已提醒", 否则会被静默吞掉却标记已读.
        const sendNotification = (n: any) => {
          const cfg = getConfig ? getConfig() || {} : {};
          const notif = cfg.notifications || {};
          if (
            notif.quiet_hours_start &&
            notif.quiet_hours_end &&
            inQuietHours(
              new Date(),
              notif.quiet_hours_start,
              notif.quiet_hours_end,
            )
          ) {
            return false;
          }
          if (
            !ElectronNotification.isSupported ||
            !ElectronNotification.isSupported()
          ) {
            return false;
          }
          new ElectronNotification({
            title: n.title,
            body: n.body,
            silent: false,
          }).show();
          return true;
        };
        // 登录态失效提醒 (codex) — 复用同一个 sendNotification, 已套静默时段
        let authNotified = 0;
        try {
          authNotified = _runAuthReminder(
            results,
            actualDeps,
            alertDeps,
            sendNotification,
          );
        } catch {
          /* noop */
        }

        const alertOut = await checkAiUsageAlerts({
          ...alertDeps,
          sendNotification,
        });
        const totalNotified =
          (alertOut && alertOut.notified ? alertOut.notified : 0) + authNotified;
        if (totalNotified > 0 && sendToRenderer) {
          sendToRenderer("sidenav:badge", {
            key: "ai-usage",
            count: totalNotified,
          });
        }
      } catch {
        /* noop */
      }
    }
  }

  // 用 moduleObj 转发, 这样单测能 vi.spyOn(helper, "refreshOnce") 拦截
  // setInterval 路径 (闭包直接引 refreshOnce 的话 spy 抓不到).
  const moduleObj: any = {};
  moduleObj.refreshOnce = refreshOnce;
  moduleObj.start = function start({
    intervalMs = 30 * 60 * 1000,
    deferInitial = true,
  }: any = {}) {
    if (intervalHandle || stopped) return;
    const run = () => moduleObj.refreshOnce();
    if (deferInitial) {
      setImmediate(run);
    } else {
      run();
    }
    intervalHandle = setManagedInterval(() => {
      moduleObj.refreshOnce();
    }, intervalMs, { label: "ai-usage-refresh" });
  };
  moduleObj.stop = function stop() {
    stopped = true;
    if (intervalHandle) {
      try {
        clearManaged(intervalHandle);
      } catch {
        /* noop */
      }
      intervalHandle = null;
    }
  };
  moduleObj._buildEmptyDeps = _buildEmptyDeps;

  return moduleObj;
}

