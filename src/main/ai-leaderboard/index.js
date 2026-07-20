/**
 * src/main/ai-leaderboard/index.js
 *
 * 模块出口（供 IPC 层 / scheduler 调用）。
 *   - getLeaderboard: 聚合入口（对外稳定契约）
 *   - registerLeaderboardScheduler: 注册每日同步调度器
 *   - triggerLeaderboardSync: 手动/事件触发一次同步（含未注册兜底）
 */

const { getLeaderboard, matchesCategory } = require("./aggregator");
const { registerLeaderboardScheduler } = require("./scheduler");

let _scheduler = null;

/**
 * 注册并对齐模块级调度器句柄（scheduler.start 由 bootstrap 调用）。
 * @param {object} [deps]
 * @returns {{start:function, stop:function, triggerNow:function}}
 */
function registerLeaderboardSchedulerWrapped(deps) {
  _scheduler = registerLeaderboardScheduler(deps || {});
  return _scheduler;
}

/**
 * 触发一次同步（预热缓存）。未注册调度器时直接打聚合（graceful）。
 * @returns {Promise<void>}
 */
async function triggerLeaderboardSync() {
  if (_scheduler && typeof _scheduler.triggerNow === "function") {
    await _scheduler.triggerNow();
    return;
  }
  // 调度器尚未注册：直接触发一次聚合（force=false 仅预热磁盘缓存）
  await getLeaderboard({ force: false });
}

module.exports = {
  getLeaderboard,
  matchesCategory,
  registerLeaderboardScheduler: registerLeaderboardSchedulerWrapped,
  triggerLeaderboardSync,
};
