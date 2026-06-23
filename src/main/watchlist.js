/**
 * src/main/watchlist.js
 *
 * I2 v1: 扫描 check 结果, 对 pinned app 触发独立通知.
 *
 * 设计:
 *   - 纯逻辑: checkWatchlistUpdatesPure(results, watchlist) → { checked, notified, items }
 *   - 副作用: checkWatchlistUpdates(deps) → 上面 + 实际发通知 + 写回 state
 *   - lastNotifiedVersion 写回走 saveWatchlist, 自动保留 PRESERVE_FIELDS
 *   - 静默期/冷却: 由 sendNotification 内部 inQuietHours / cooldown 处理
 *
 * Spec: docs/superpowers/specs/2026-06-23-i2-watchlist-design.md §3.3
 */
'use strict';

const stateStore = require('./state-store');
const { mainLog } = require('./log');

/**
 * 纯函数: 给定 check results + watchlist, 算要通知哪些 app.
 * @param {Array<{name:string, hasUpdate:boolean, latestVersion?:string}>} results
 * @param {Array<{appName:string, lastNotifiedVersion?:string|null}>} watchlist
 * @returns {{ checked: number, notified: number, items: Array<{appName, latestVersion}> }}
 */
function checkWatchlistUpdatesPure(results, watchlist) {
  if (!Array.isArray(watchlist) || watchlist.length === 0) {
    return { checked: 0, notified: 0, items: [] };
  }
  if (!Array.isArray(results)) {
    return { checked: 0, notified: 0, items: [] };
  }
  const byName = new Map();
  for (const r of results) {
    if (r && typeof r.name === 'string') byName.set(r.name, r);
  }
  const items = [];
  for (const w of watchlist) {
    if (!w || typeof w.appName !== 'string') continue;
    const r = byName.get(w.appName);
    if (!r || !r.hasUpdate) continue;
    if (w.lastNotifiedVersion === r.latestVersion) continue; // 已通知
    items.push({ appName: w.appName, latestVersion: r.latestVersion });
  }
  return { checked: watchlist.length, notified: items.length, items };
}

/**
 * 副作用: 写回 lastNotifiedVersion + 触发通知.
 * @param {object} deps
 * @param {Array} deps.results                  runCheckQueued 返的 results 数组
 * @param {Array} [deps.watchlist]              默认 loadWatchlist()
 * @param {Function} [deps.sendNotification]    ({ title, body }) => any
 * @param {Function} [deps.now]                 默认 Date.now
 * @param {Function} [deps.saveWatchlist]       默认 stateStore.saveWatchlist
 * @param {object}   [deps.log]                 测试用, 默认 mainLog
 * @returns {{ checked, notified, items }}
 */
function checkWatchlistUpdates(deps) {
  const {
    results,
    watchlist = stateStore.loadWatchlist(),
    sendNotification = null,
    now = Date.now,
    saveWatchlist = stateStore.saveWatchlist,
    log = mainLog,
  } = deps || {};
  const out = checkWatchlistUpdatesPure(results, watchlist);
  if (out.notified === 0) return out;
  // 写回 lastNotifiedVersion
  const byApp = new Map(out.items.map((it) => [it.appName, it.latestVersion]));
  const updated = watchlist.map((w) =>
    byApp.has(w.appName)
      ? { ...w, lastNotifiedVersion: byApp.get(w.appName) }
      : w,
  );
  try {
    saveWatchlist(updated);
  } catch (err) {
    if (log && typeof log.warn === 'function') {
      log.warn(`[watchlist] saveWatchlist failed: ${err && err.message}`);
    }
  }
  // 触发通知
  if (typeof sendNotification === 'function') {
    for (const it of out.items) {
      try {
        sendNotification({
          title: `⭐ ${it.appName} 升级`,
          body: `新版本 ${it.latestVersion}`,
        });
      } catch (err) {
        if (log && typeof log.warn === 'function') {
          log.warn(`[watchlist] sendNotification failed: ${err && err.message}`);
        }
      }
    }
  }
  return out;
}

module.exports = {
  checkWatchlistUpdatesPure,
  checkWatchlistUpdates,
};