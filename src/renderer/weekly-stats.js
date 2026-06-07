/**
 * src/renderer/weekly-stats.js
 *
 * Phase 19: 周报式摘要数据. 从 state.json 计算过去 7 天的 "升级" 统计.
 *
 * 升级判定: changelog_history 里 ts 在过去 7 天的条目 (一次版本变化 = 一次升级).
 *  假设: 装了这个工具的用户都是开发者, 7 天没新版本说明 app 在维护期.
 *
 * 输入: state object (stateStore.load() 的结果) — { apps: { ... } }
 * 输出: {
 *   upgrades: 数字, 过去 7 天的升级次数
 *   apps: ['Cursor', 'Marvis', ...] 升级过的 app 名
 *   totalChangelogChars: 数字, 过去 7 天 changelog 总字符数
 *   windowMs: 统计窗口大小 (默认 7 天, 测试可调)
 *   oldest: epoch ms, 窗口内最早的 ts; null 表示窗口内无事件
 * }
 */

const WINDOW_MS_DEFAULT = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {object} state  stateStore.load() 的结果
 * @param {object} [opts]
 * @param {number} [opts.windowMs=7d]
 * @param {number} [opts.now=Date.now()]
 * @returns {object}
 */
export function computeWeeklyStats(state, opts = {}) {
  const windowMs = typeof opts.windowMs === 'number' ? opts.windowMs : WINDOW_MS_DEFAULT;
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const cutoff = now - windowMs;
  const appsMap = (state && state.apps) || {};

  let upgrades = 0;
  let totalChangelogChars = 0;
  const apps = [];
  let oldest = null;

  for (const [name, app] of Object.entries(appsMap)) {
    if (!app) continue;
    const history = Array.isArray(app.changelog_history) ? app.changelog_history : [];
    for (const h of history) {
      if (!h || typeof h.ts !== 'number') continue;
      if (h.ts <= cutoff) continue;  // 严格 "<=" 边界: 正好 windowMs 前的 ts 不算
      upgrades += 1;
      apps.push(name);
      if (typeof h.changelog === 'string') {
        totalChangelogChars += h.changelog.length;
      }
      if (oldest === null || h.ts < oldest) oldest = h.ts;
    }
  }

  // 去重 app 名 (一个 app 多次升级只算一个)
  const uniqueApps = Array.from(new Set(apps));

  return {
    upgrades,
    apps: uniqueApps,
    totalChangelogChars,
    windowMs,
    oldest,
  };
}
