/**
 * src/utils/stale-detect.js
 *
 * 纯函数: 检测"多久没新结果"的 app 列表, 给 check-runner + tray 用.
 *
 * 业务背景: 13 个 app 走 plist → json → regex → system_profiler 兜底链, 全链挂时
 * Promise.allSettled 返 95s timeout, state.ts 还在但 status=error 累加 N 次.
 * 现状: 7 天没新结果的 app 还在用 last-known 假装"已检". 用户不知道底层早挂了.
 *
 * 本函数给两类 caller:
 *   1. check-runner: 算 silent 模式下要不要"全链刷新" (本 PR 不接, 留 hook)
 *   2. tray 菜单: 推 "(N 个 app 超 N 天没新结果)" 行, click 触发 onCheck
 *
 * 阈值默认 7 天, 配置可调 (state.appSettings.checkStaleDays).
 *
 * 输入: state.apps[name] = { ts, status, ... } | undefined
 *   ts: 上次**成功**检测时间戳 (ms)
 *   status: 'ok' | 'error' | 'pending' | undefined
 *
 * 输出: { staleNames, staleCount, freshestTs }
 *   - staleNames: 超过 threshold 天没成功的 app name 列表
 *   - staleCount: 同上长度
 *   - freshestTs: 所有 app 中最新一次成功 ts (now - freshestTs 给 tray 显示 "整体 X 天没新结果")
 *
 * 边界:
 *   - stateApps 是 null/空: 返 { staleNames: [], staleCount: 0, freshestTs: 0 }
 *   - threshold <= 0: 返空 (禁用 stale 检测)
 *   - now 不传: 用 Date.now() (测试时可注入)
 */

const DEFAULT_STALE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {object} stateApps     state.apps (name → { ts, status, ... })
 * @param {number} [now]         当前时间戳 (ms), 测试可注入
 * @param {number} [thresholdDays] 默认 7
 * @returns {{ staleNames: string[], staleCount: number, freshestTs: number }}
 */
function detectStaleApps(stateApps, now, thresholdDays) {
  if (!stateApps || typeof stateApps !== "object") {
    return { staleNames: [], staleCount: 0, freshestTs: 0 };
  }
  const nowMs = typeof now === "number" ? now : Date.now();
  // threshold <= 0 → 禁用 stale 检测 (返空列表, 但 freshestTs 仍统计,
  // 给调用方"整体最近一次成功"这个独立信号). 业务场景: 用户配
  // checkStaleDays=0 表示"我不在乎, 别提示", 但其它 UI 可能还想用 freshestTs.
  const days =
    typeof thresholdDays === "number" && thresholdDays > 0
      ? thresholdDays
      : DEFAULT_STALE_DAYS;
  const staleDisabled =
    typeof thresholdDays === "number" && thresholdDays <= 0;
  const thresholdMs = days * MS_PER_DAY;

  const staleNames = [];
  let freshestTs = 0;
  for (const [name, app] of Object.entries(stateApps)) {
    if (!app || typeof app !== "object") continue;
    const ts = typeof app.ts === "number" ? app.ts : 0;
    const status = app.status;
    // 成功过 (status === 'ok' 或 ts > 0 + status !== 'error') 都算"有结果"
    // 简化: ts > 0 且 status !== 'error' 算成功一次
    const isSuccess = ts > 0 && status !== "error";
    if (isSuccess) {
      if (ts > freshestTs) freshestTs = ts;
      if (!staleDisabled && nowMs - ts > thresholdMs) {
        staleNames.push(name);
      }
    }
  }
  return { staleNames, staleCount: staleNames.length, freshestTs };
}

module.exports = { detectStaleApps, DEFAULT_STALE_DAYS };
