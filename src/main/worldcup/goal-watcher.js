/**
 * src/main/worldcup/goal-watcher.js
 *
 * v2.16.0 世界杯进球通知 — 60s 调度 + 纯函数 diff + 系统通知.
 *
 * 模式跟 src/main/reminders.js 一致:
 *   - 走 state-store.patchState (atomic write, preserveExtraFields)
 *   - 顶层 state.json.worldcupGoalNotified = { [matchKey]: { notified: string[], updatedAt: number } }
 *   - 调度: setInterval(60s) sweep, onGoal 调 onGoal(notif, meta)
 *
 * 去重: 双重过滤
 *   1) prevScorers 数组 (上轮 scorers) — 防止 60s 内重复推
 *   2) notified list (state 持久化) — 防止重启后重推历史进球
 *
 * 进球类型标记: ownGoal / penalty 在通知标题加前缀; 不进 key.
 */

const stateStore = require("../state-store");
const { mainLog } = require("../log");
const { matchKey, isMatchStarted, matchKickoffUtcMs } = require("./match-key");
const { parseWorldcupTxt } = require("./parser");
const { refreshWorldcupScores } = require("./scores-fetcher");

const SWEEP_INTERVAL_MS = 60 * 1000;       // 60s
const MAX_GOAL_KEYS_PER_MATCH = 50;        // 单场 goalKey 上限
const MAX_NOTIFICATIONS_PER_SWEEP = 10;    // 单 sweep 推送上限
const MATCH_TOO_OLD_DAYS = 30;             // 30 天前比赛排除

// ── 纯函数 ─────────────────────────────────────────────────

/**
 * 拼去重 key: minute|player|teamSide
 * 不用 ownGoal/penalty 进 key (ESPN 偶尔漏标, 会破坏去重).
 * @param {{minute: string, player: string, teamSide: string, ownGoal?: boolean, penalty?: boolean}} scorer
 * @returns {string}
 */
function _goalKeyOfScorer(scorer) {
  if (!scorer) return "";
  return `${scorer.minute || ""}|${scorer.player || "undefined"}|${scorer.teamSide || ""}`;
}

module.exports = {
  _goalKeyOfScorer,
  SWEEP_INTERVAL_MS,
  MAX_GOAL_KEYS_PER_MATCH,
  MAX_NOTIFICATIONS_PER_SWEEP,
  MATCH_TOO_OLD_DAYS,
};