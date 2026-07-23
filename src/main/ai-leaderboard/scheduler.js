/**
 * src/main/ai-leaderboard/scheduler.js
 *
 * 主进程每日同步调度（封装 setManagedInterval）。
 * 每日拉取一次（预暖缓存），失败 graceful（不阻断启动 / 不抛）。
 *
 * 与 bootstrap/schedulers.js 的其它调度器同构；由 main/index.js 在启动期注册。
 */

const { setManagedInterval, clearManaged } = require("../timer-registry.ts");
const { getLeaderboard } = require("./aggregator");
const { pruneOldCache } = require("./history");
const { mainLog } = require("../log.ts");

const DAILY_MS = 24 * 60 * 60 * 1000;

let _handle = null;

/**
 * 注册 AI 榜单每日同步调度器。
 * @param {object} [deps]
 * @param {number} [deps.intervalMs] 默认 24h
 * @returns {{start:function, stop:function, triggerNow:function}}
 */
function registerLeaderboardScheduler(deps = {}) {
  const intervalMs =
    typeof deps.intervalMs === "number" && deps.intervalMs > 0
      ? deps.intervalMs
      : DAILY_MS;

  async function triggerNow() {
    try {
      await getLeaderboard({ force: false });
      pruneOldCache(30);
      mainLog.info("[ai-leaderboard] daily sync ok");
    } catch (err) {
      mainLog.warn(`[ai-leaderboard] daily sync failed: ${err && err.message}`);
    }
  }

  function start() {
    if (_handle) return;
    try {
      // ponytail: 一次性 30-90 min jiterr, 避免跟所有 Pulse 用户在同一 UTC 时间点叠峰打 AA + 避开启动 check 抢资源
      const firstDelayMs = 30 * 60 * 1000 + Math.floor(Math.random() * 60 * 60 * 1000);
      setTimeout(() => triggerNow().catch(() => {}), firstDelayMs);
      mainLog.info(
        `[ai-leaderboard] first sync scheduled in ${Math.round(firstDelayMs / 60000)}min`,
      );
      _handle = setManagedInterval(
        () => {
          triggerNow().catch(() => {});
        },
        intervalMs,
        {
          label: "ai-leaderboard",
          file: "src/main/ai-leaderboard/scheduler.js",
          line: 0,
        },
      );
      mainLog.info(
        `[ai-leaderboard] scheduler started (every ${Math.round(intervalMs / 60000)}min)`,
      );
    } catch (err) {
      mainLog.warn(`[ai-leaderboard] scheduler init failed: ${err && err.message}`);
    }
  }

  function stop() {
    if (_handle) {
      try {
        clearManaged(_handle);
      } catch {
        /* noop */
      }
      _handle = null;
    }
  }

  return { start, stop, triggerNow };
}

module.exports = { registerLeaderboardScheduler, DAILY_MS };
