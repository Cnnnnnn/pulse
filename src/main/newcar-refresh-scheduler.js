/**
 * src/main/newcar-refresh-scheduler.js
 *
 * P1: 定时重读内置 2026 发布日历, 比对用户订阅 (品牌 / 能源),
 * 命中"未来 30 天内即将发布"的车型则推送 nav 角标.
 *
 * 设计 (仿 ai-usage-refresh-scheduler):
 *   - createNewCarRefreshScheduler({ sendToRenderer, getSubscriptions, loadBuiltin })
 *   - refreshOnce(): 比对订阅 vs 即将发布 → sendToRenderer("sidenav:badge", {key:"newcar",count})
 *   - start({intervalMs}): 首次立即 fire + setInterval
 *   - stop(): 幂等 clearInterval
 *
 * MVP 边界: 订阅来自 renderer (经 IPC 写入 main state); 未提供时默认空订阅 → 不推送角标.
 * 数据集读取: 真实 P1 由 renderer 经 IPC 推送 releases; 这里留 loadBuiltin 注入点.
 */

function createNewCarRefreshScheduler(opts = {}) {
  const sendToRenderer =
    typeof opts.sendToRenderer === 'function' ? opts.sendToRenderer : null;
  const getSubscriptions =
    typeof opts.getSubscriptions === 'function'
      ? opts.getSubscriptions
      : () => ({ brands: [], energyTypes: [] });
  const loadBuiltin =
    typeof opts.loadBuiltin === 'function' ? opts.loadBuiltin : () => ({ releases: [] });

  let intervalHandle = null;
  let stopped = false;

  /**
   * 比对订阅与"未来 30 天即将发布", 返回命中数.
   * @returns {number}
   */
  function checkMatches() {
    let subs = {};
    try {
      subs = getSubscriptions() || {};
    } catch {
      subs = {};
    }
    const brands = Array.isArray(subs.brands) ? subs.brands : [];
    const energyTypes = Array.isArray(subs.energyTypes) ? subs.energyTypes : [];
    if (brands.length === 0 && energyTypes.length === 0) return 0; // 无订阅不推送

    let ds = { releases: [] };
    try {
      ds = loadBuiltin() || { releases: [] };
    } catch {
      ds = { releases: [] };
    }
    const releases = Array.isArray(ds.releases) ? ds.releases : [];
    const now = Date.now();
    const dayMs = 86400000;
    let count = 0;
    for (const r of releases) {
      if (!r || typeof r.releaseDate !== 'string') continue;
      const rd = new Date(`${r.releaseDate}T00:00:00`).getTime();
      if (Number.isNaN(rd)) continue;
      const daysAhead = (rd - now) / dayMs;
      if (daysAhead < 0 || daysAhead > 30) continue; // 仅看未来 30 天
      if (brands.length && !brands.includes(r.brand)) continue;
      if (energyTypes.length && !energyTypes.includes(r.energyType)) continue;
      count++;
    }
    return count;
  }

  async function refreshOnce() {
    const count = checkMatches();
    if (count > 0 && sendToRenderer) {
      try {
        sendToRenderer('sidenav:badge', { key: 'newcar', count });
      } catch {
        /* noop */
      }
    }
  }

  const moduleObj = {};
  moduleObj.refreshOnce = refreshOnce;
  moduleObj.start = function start({ intervalMs = 30 * 60 * 1000, deferInitial = true } = {}) {
    if (intervalHandle || stopped) return;
    const run = () => moduleObj.refreshOnce();
    if (deferInitial) setImmediate(run);
    else run();
    intervalHandle = setInterval(run, intervalMs);
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
  return moduleObj;
}

module.exports = { createNewCarRefreshScheduler };
