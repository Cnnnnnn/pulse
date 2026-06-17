/**
 * src/main/ai-usage-refresh-scheduler.js
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
const registerAiUsage = require("./ipc/register-ai-usage");
const { PROVIDERS } = require("./ai-usage-cache");

function createAiUsageRefreshScheduler(opts = {}) {
  const trayMgr = opts.trayMgr;
  // deps 走 opts (允许测试注入), 缺省时用 register-ai-usage 自己的 deps
  // 实际 main 进程应该传相同的 deps (stateStore / storage / clients / pushEvent).
  // 对于 tray refresh, pushEvent 可以是 no-op (tray 不通过 IPC 收事件, 直接读 cache).
  const deps = opts.deps;

  let intervalHandle = null;
  let stopped = false;

  function _buildEmptyDeps() {
    // 如果用户没传 deps, 我们就调 _internals.fetch 但它需要 deps.
    // 真实生产代码必须传. 这里是 fallback: 用空 deps 让 fetch 走 'api_key_missing'
    // 路径 (catch 住). 这是为了不抛, 允许 refresh 周期继续.
    return deps || {
      stateStore: { loadSnapshotProvider: () => null, saveSnapshotProvider: () => {}, loadHistoryProvider: () => null, appendHistoryProvider: () => {} },
      storage: { loadApiKey: () => null },
      MiniMaxQuotaClient: null,
      GlmQuotaClient: null,
      pushEvent: () => {},
    };
  }

  async function refreshOnce() {
    const actualDeps = _buildEmptyDeps();
    const fetchPromises = PROVIDERS.map((pid) =>
      registerAiUsage._internals
        .fetch({ deps: actualDeps, opts: { provider: pid } })
        .catch((err) => ({ ok: false, provider: pid, reason: "exception", error: err && err.message }))
    );
    // wait all, ignore individual failures (we don't block)
    await Promise.allSettled(fetchPromises);
    // Now push to tray (state.json was updated by successful fetches)
    if (trayMgr && typeof trayMgr.setAiUsage === "function") {
      try {
        // 内部 lazy require, 让 vi.spyOn(cache, "createAiUsageCache") 能拦截
        // (顶层 require 拿到的 reference 不受 spy 影响)
        const { createAiUsageCache } = require("./ai-usage-cache");
        const cache = createAiUsageCache({});
        trayMgr.setAiUsage({
          minimax: cache.getTraySummary("minimax"),
          glm: cache.getTraySummary("glm"),
        });
      } catch (err) {
        // swallow — tray update failure should not kill the loop
      }
    }
  }

  // 用 moduleObj 转发, 这样单测能 vi.spyOn(helper, "refreshOnce") 拦截
  // setInterval 路径 (闭包直接引 refreshOnce 的话 spy 抓不到).
  const moduleObj = {};
  moduleObj.refreshOnce = refreshOnce;
  moduleObj.start = function start({ intervalMs = 30 * 60 * 1000 } = {}) {
    if (intervalHandle || stopped) return;
    // 立即 fire 一次 (不 await — fire and forget)
    moduleObj.refreshOnce();
    intervalHandle = setInterval(() => {
      moduleObj.refreshOnce();
    }, intervalMs);
  };
  moduleObj.stop = function stop() {
    stopped = true;
    if (intervalHandle) {
      try { clearInterval(intervalHandle); } catch { /* noop */ }
      intervalHandle = null;
    }
  };
  moduleObj._buildEmptyDeps = _buildEmptyDeps;

  return moduleObj;
}

module.exports = { createAiUsageRefreshScheduler };
