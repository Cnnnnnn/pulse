/**
 * src/main/check-runner.js
 *
 * Phase 16: 抽出 check 逻辑, 让 IPC handler 和后台定时器共用.
 * Phase 27: 通知 dispatch 时跳过 muted apps.
 *
 * 入口: runCheck(ctx, { silent })
 *   - silent=false (默认, IPC 调用): 推 check-started/finished 事件, 发系统通知
 *   - silent=true (后台定时): 静默, 只更新 state + tray/badge + 发 auto-check-finished
 *
 * 依赖 (从 index.js 注入):
 *   - getConfig()  → 读 appCfg 列表
 *   - pool         → 跑 detect-app task
 *   - getWindow()  → 推事件给 renderer
 *   - onCheckComplete(results) → 推给 tray/badge + state-store
 */

const { Notification: ElectronNotification } = require('electron');
const { inQuietHours, suppressedByCooldown } = require('./notification-policy');
const { isMuteActive } = require('./state-store');

/**
 * @param {object} deps
 * @param {object} deps.getConfig
 * @param {object} deps.pool
 * @param {object} deps.getWindow
 * @param {object} deps.onCheckComplete
 * @param {object} [deps.getState]          () => state object (含 last_notified, mutes)
 * @param {object} [deps.markNotified]     (names: string[]) => void   写 state
 * @param {object} [deps.Notification]      测试用: 注入 Notification 构造器. 默认 = electron.Notification
 * @param {object} [opts]
 * @param {boolean} [opts.silent=false]  true = 后台自动 check, 不打扰用户
 * @returns {Promise<Array>} results
 */
async function runCheck(deps, opts = {}) {
  const {
    getConfig, pool, getWindow, onCheckComplete, getState, markNotified,
    Notification: NotificationCtor,
  } = deps;
  const Notification = NotificationCtor || ElectronNotification;
  const silent = !!opts.silent;
  const config = getConfig() || { apps: [] };
  const apps = config.apps || [];
  const notifCfg = (config && config.notifications) || {};
  const quietStart = notifCfg.quiet_hours_start;
  const quietEnd   = notifCfg.quiet_hours_end;
  const cooldownMs = (typeof notifCfg.cooldown_hours === 'number' && notifCfg.cooldown_hours > 0)
    ? notifCfg.cooldown_hours * 60 * 60 * 1000
    : 0; // 0 = 不限制

  function sendToRenderer(channel, payload) {
    const w = getWindow && getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }

  if (!silent) {
    sendToRenderer('check-started', { count: apps.length, ts: Date.now() });
  }

  // 队列化: 每个 app 一个 detect-app task
  // Phase 18: 把 state.apps[name].changelog_history 透传给 worker, 一起进 result
  const stateApps = (typeof getState === 'function' && getState() && getState().apps) || {};
  const tasks = apps.map((appCfg) => {
    const history = (appCfg && appCfg.name && stateApps[appCfg.name])
      ? stateApps[appCfg.name].changelog_history
      : undefined;
    return pool.enqueue({
      type: 'detect-app',
      payload: {
        appCfg: { ...appCfg, changelog_history: Array.isArray(history) ? history : [] },
      },
    });
  });
  const settled = await Promise.allSettled(tasks);
  const results = settled.map((s, i) => {
    if (s.status === 'fulfilled' && s.value) {
      return s.value;
    }
    const appCfg = apps[i] || {};
    return {
      name: appCfg.name || `app-${i}`,
      installed_version: null,
      latest_version: null,
      has_update: false,
      status: 'error',
      source: '',
      note: (s.reason && s.reason.message) || 'task failed',
      bundle: appCfg.bundle || '',
    };
  });

  // 落盘 + tray/badge
  if (typeof onCheckComplete === 'function') {
    try { onCheckComplete(results); } catch { /* noop */ }
  }

  // 系统通知: silent 时不发
  if (!silent) {
    const updateApps = results.filter((r) => r.has_update);

    // Phase 17: Quiet hours 抑制
    if (inQuietHours(new Date(), quietStart, quietEnd)) {
      // 静默时段: 不发, 但正常 finish
      sendToRenderer('check-finished', { count: results.length, ts: Date.now() });
      return results;
    }

    // Phase 17: Cooldown 抑制 — 只显示真正"新"或 cooldown 外的
    //   suppressedByCooldown 接收整个 state (它内部读 state.apps), 不是 appsMap.
    //   之前传 appsMap 是 bug — 让 cooldown 在生产里永远不触发 (默认 cooldown=0 掩盖了).
    const state = (typeof getState === 'function') ? getState() : null;
    const suppressed = new Set(suppressedByCooldown(updateApps, state, cooldownMs));
    let notifyable = updateApps.filter((r) => !suppressed.has(r.name));

    // Phase 27: Mutes 抑制 — 跳过已静音的 app
    //   读 state.mutes, 过滤掉 isMuteActive(mute, now)=true 的
    //   跟 cooldown 一样: 只抑制通知, 不影响 result / state.ts (user 还能看到 update)
    const mutes = (state && state.mutes) || {};
    const now = Date.now();
    notifyable = notifyable.filter((r) => !isMuteActive(mutes[r.name], now));

    if (notifyable.length > 0) {
      const names = notifyable.map((r) => r.name).join('、');
      try {
        new Notification({
          title: 'Pulse',
          body: `${notifyable.length} 个应用有更新：${names}`,
          silent: false,
        }).show();
      } catch { /* notification 不可用时静默 */ }
      // 标记已通知 (写 state)
      if (typeof markNotified === 'function') {
        try { markNotified(notifyable.map((r) => r.name)); } catch { /* noop */ }
      }
    }

    sendToRenderer('check-finished', { count: results.length, ts: Date.now() });
  } else {
    // Phase 16: 后台 auto-check 完成, 推个事件给 renderer 让它知道"刚刚自动检查过"
    sendToRenderer('auto-check-finished', { count: results.length, ts: Date.now() });
  }

  return results;
}

module.exports = { runCheck };
