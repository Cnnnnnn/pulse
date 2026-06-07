/**
 * src/main/ipc.js
 *
 * IPC handler 注册（spec §6 协议）。
 *   renderer → main:  check-updates, brew-upgrade, bulk-upgrade:start/cancel,
 *                     get-config, get-cached-state, get-app-icon, open-url
 *   main → renderer:  check-progress (worker 进度)
 *                    check-started, check-finished (手动)
 *                    auto-check-finished (Phase 16 后台静默检查)
 *                    start-check (tray 点 "检查更新" 触发)
 *                    bulk-upgrade:progress, bulk-upgrade:done (Bulk Upgrade)
 *
 * 约束：主进程不直接跑检测，全部走 worker pool。
 *       Bulk Upgrade 在主进程跑（顺序 shell exec，不阻塞事件循环）。
 */

const { ipcMain, shell } = require('electron');
const { runCheck } = require('./check-runner');
const { runBulkUpgrade } = require('./bulk-upgrade');
const stateStore = require('./state-store');
const { getAppIcon } = require('./app-icon');
const { mainLog } = require('./log');

// Bulk Upgrade: 一次只能跑一批; 用 AbortController 控制取消.
let bulkUpgradeCtrl = null;
let bulkUpgradeRunning = false;

/**
 * @param {object} deps
 * @param {object} deps.getConfig         () => config object
 * @param {object} deps.pool              WorkerPool 实例
 * @param {object} deps.getWindow         () => BrowserWindow | null
 * @param {object} deps.onCheckComplete   (results) => void   (用于更新 tray/badge)
 * @param {object} [deps.getCachedState]  () => state object  (Phase 12 last-known 缓存)
 */
function registerIpcHandlers(deps) {
  const {
    getConfig,
    pool,
    getWindow,
    onCheckComplete,
    getCachedState,
  } = deps;

  function sendToRenderer(channel, payload) {
    const w = getWindow && getWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload);
    }
  }

  // ── renderer → main ─────────────────────────────────────────

  ipcMain.handle('get-config', () => {
    try { return getConfig(); }
    catch { return { check_on_launch: true, apps: [] }; }
  });

  // Phase 12: renderer 启动时拉取 last-known state, 避免网络抽风时 UI 一片空白
  ipcMain.handle('get-cached-state', () => {
    if (typeof getCachedState !== 'function') return null;
    try { return getCachedState(); }
    catch { return null; }
  });

  ipcMain.handle('check-updates', async () => {
    // Phase 16/17: 抽到 check-runner.runCheck, 注入 state-store 让 quiet hours / cooldown
    // 跟踪 last_notified 字段
    return runCheck(
      {
        getConfig,
        pool,
        getWindow,
        onCheckComplete,
        getState: () => {
          try { return stateStore.load(); } catch { return null; }
        },
        markNotified: (names) => {
          try { stateStore.markNotified(names); } catch { /* noop */ }
        },
      },
      { silent: false }
    );
  });

  ipcMain.handle('brew-upgrade', async (_event, caskName) => {
    if (!caskName) return { success: false, output: 'no cask' };
    // 走 worker 跑（保持主进程不阻塞）
    return pool.enqueue({ type: 'brew-upgrade', payload: { cask: caskName } });
  });

  ipcMain.handle('open-url', async (_event, url) => {
    if (url && /^https?:\/\//.test(url)) {
      try { await shell.openExternal(url); return true; } catch { return false; }
    }
    return false;
  });

  // ── Bulk Upgrade ────────────────────────────────────────
  // 一次只跑一批; 跑的时候再发 start 会直接拒绝, 避免并发 brew 撞 mutex.

  ipcMain.handle('bulk-upgrade:start', async (_event, items) => {
    if (bulkUpgradeRunning) {
      return { ok: false, reason: 'already running' };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, reason: 'no items' };
    }
    bulkUpgradeRunning = true;
    bulkUpgradeCtrl = new AbortController();
    const ctrl = bulkUpgradeCtrl;

    // fire-and-forget: 返回 ok=true 表示"开始", 进度/完成走事件
    runBulkUpgrade({
      items,
      signal: ctrl.signal,
      onProgress: (evt) => {
        sendToRenderer('bulk-upgrade:progress', evt);
      },
    }).then((summary) => {
      sendToRenderer('bulk-upgrade:done', summary);
      if (ctrl === bulkUpgradeCtrl) {
        bulkUpgradeCtrl = null;
        bulkUpgradeRunning = false;
      }
    }).catch((err) => {
      // runBulkUpgrade 内部已经 per-item catch, 跑到这说明 outside 出错
      sendToRenderer('bulk-upgrade:done', {
        succeeded: [],
        failed: [{ id: '?', error: (err && err.message) || 'unknown' }],
        skipped: [],
        cancelled: false,
      });
      if (ctrl === bulkUpgradeCtrl) {
        bulkUpgradeCtrl = null;
        bulkUpgradeRunning = false;
      }
    });

    return { ok: true, count: items.length };
  });

  ipcMain.handle('bulk-upgrade:cancel', async () => {
    if (!bulkUpgradeRunning || !bulkUpgradeCtrl) {
      return { ok: false, reason: 'not running' };
    }
    bulkUpgradeCtrl.abort();
    return { ok: true };
  });

  // ── 兼容旧 channel 已删除 (Phase 13): get-installed-version / brew-update ──

  // Phase 25: 读 app bundle 真实图标 (macOS), 返 base64 dataUrl.
  //   - bundle 路径: 通常 '/Applications/Cursor.app' 这种 .app bundle
  //   - 失败: 返 { error: 'not_found' }, 不抛
  //   - 成功: 返 { dataUrl: 'data:image/png;base64,...' } (64x64)
  ipcMain.handle('get-app-icon', async (_event, bundlePath) => {
    try {
      const dataUrl = await getAppIcon(bundlePath);
      if (!dataUrl) return { error: 'not_found' };
      if (typeof dataUrl !== 'string' || dataUrl.length < 30) return { error: 'invalid' };
      return { dataUrl };
    } catch (err) {
      mainLog.warn('[ipc] get-app-icon threw', { bundle: bundlePath, msg: err && err.message });
      return { error: 'threw' };
    }
  });

  // ── Phase 27: Mutes (per-app 静音) ─────────────────────
  // 渲染进程负责显示菜单 / 触发 setMute / clearMute; 主进程只管读写 state.json
  // (跟 last_notified 同一条线). 同步返当前 mutes, 让 renderer 立即更新 signal.

  ipcMain.handle('get-mutes', () => {
    try {
      return { mutes: stateStore.getMutes() };
    } catch (err) {
      mainLog.warn('[ipc] get-mutes threw', { msg: err && err.message });
      return { mutes: {} };
    }
  });

  /**
   * @param {string} name        app name
   * @param {number} durationSec 静音时长 (秒). 0 = 永远.
   */
  ipcMain.handle('set-mute', (_event, name, durationSec) => {
    if (!name || typeof name !== 'string') {
      return { ok: false, reason: 'invalid_name', mutes: stateStore.getMutes() };
    }
    if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 0) {
      return { ok: false, reason: 'invalid_duration', mutes: stateStore.getMutes() };
    }
    try {
      const untilMs = durationSec === 0 ? 0 : Date.now() + durationSec * 1000;
      const next = stateStore.setMute(name, untilMs, 'manual');
      return { ok: true, mutes: next.mutes };
    } catch (err) {
      mainLog.warn('[ipc] set-mute threw', { name, msg: err && err.message });
      return { ok: false, reason: 'threw', mutes: stateStore.getMutes() };
    }
  });

  ipcMain.handle('clear-mute', (_event, name) => {
    if (!name || typeof name !== 'string') {
      return { ok: false, reason: 'invalid_name', mutes: stateStore.getMutes() };
    }
    try {
      const next = stateStore.clearMute(name);
      return { ok: true, mutes: next.mutes };
    } catch (err) {
      mainLog.warn('[ipc] clear-mute threw', { name, msg: err && err.message });
      return { ok: false, reason: 'threw', mutes: stateStore.getMutes() };
    }
  });
}

module.exports = { registerIpcHandlers };
