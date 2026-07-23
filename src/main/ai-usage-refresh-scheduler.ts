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
const registerAiUsage = require("./ipc/register-ai-usage.ts");
const { PROVIDERS } = require("./ai-usage-cache.ts");
const { inQuietHours } = require("./notification-policy");
const { Notification: ElectronNotification } = require("electron");

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
    await Promise.allSettled(fetchPromises);
    // Now push to tray (state.json was updated by successful fetches)
    if (trayMgr && typeof trayMgr.setAiUsage === "function") {
      try {
        const { createAiUsageCache } = require("./ai-usage-cache.ts");
        const cache = createAiUsageCache({});
        trayMgr.setAiUsage({
          minimax: cache.getTraySummary("minimax"),
          glm: cache.getTraySummary("glm"),
        });
      } catch (err) {
        // swallow — tray update failure should not kill the loop
      }
    }

    if (alertDeps) {
      try {
        const { checkAiUsageAlerts } = require("./ai-usage-alerts.ts");
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
        const alertOut = await checkAiUsageAlerts({
          ...alertDeps,
          sendNotification,
        });
        if (alertOut && alertOut.notified > 0 && sendToRenderer) {
          sendToRenderer("sidenav:badge", {
            key: "ai-usage",
            count: alertOut.notified,
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
    intervalHandle = setInterval(() => {
      moduleObj.refreshOnce();
    }, intervalMs);
  };
  moduleObj.stop = function stop() {
    stopped = true;
    if (intervalHandle) {
      try {
        clearInterval(intervalHandle);
      } catch {
        /* noop */
      }
      intervalHandle = null;
    }
  };
  moduleObj._buildEmptyDeps = _buildEmptyDeps;

  return moduleObj;
}

module.exports = { createAiUsageRefreshScheduler };
