/**
 * src/main/release-notes.js
 *
 * ON: IPC handlers — 读 release notes 内容 + 读写 last_seen_release.
 *
 * 启动策略 (跟现有 digest / watchlist 一致): 不主动推, renderer bootstrap 后
 * 主动调 getCurrent(), 跟 isCheckRunning 一样是 fire-and-forget 风格.
 * 这样 renderer 拿到结果后能跟自己的 state (loading / mutes) 协调.
 *
 * 依赖注入: stateStore / loader 通过 deps 注入, 方便测试. Prod 走默认
 * (require('../release-notes/loader.js') + require('./state-store.js')).
 */

const { createLogger } = require('./log.js');
const defaultLoader = require('../release-notes/loader.js');
const defaultStateStore = require('./state-store.js');

const log = createLogger('release-notes');

/**
 * 注册 IPC handlers. 在 main process 启动时 (app.whenReady 之后) 调一次.
 * @param {Electron.IpcMain} ipcMainRef electron.ipcMain
 * @param {object} [deps]
 * @param {object} [deps.app]      electron.app (默认 require('electron').app)
 * @param {object} [deps.stateStore] state-store 模块 (默认 default)
 * @param {object} [deps.loader]   release-notes loader 模块 (默认 default)
 */
function registerReleaseNotes(ipcMainRef, deps = {}) {
  const app = deps.app || require('electron').app;
  const stateStore = deps.stateStore || defaultStateStore;
  const loader = deps.loader || defaultLoader;
  ipcMainRef.handle('release-notes:get-current', async () => {
    let currentVersion;
    try {
      currentVersion = app.getVersion();
    } catch (err) {
      log.warn('app.getVersion() failed:', { msg: err && err.message });
      return null;
    }

    let seen = null;
    try {
      seen = stateStore.getLastSeenRelease();
    } catch (err) {
      // fail-safe: state-store 抛错 (corruption 等) 视为已看, 不弹
      log.warn('getLastSeenRelease failed:', { msg: err && err.message });
      return { alreadySeen: true, version: currentVersion, changelogMd: null, slides: null };
    }

    const changelogMd = loader.readReleaseNotes(currentVersion);
    if (changelogMd === null) {
      // 没 release notes (发版漏了) → 不弹
      return null;
    }

    const slides = loader.readSlides(currentVersion);
    const alreadySeen = seen !== null && seen.version === currentVersion;

    return {
      version: currentVersion,
      alreadySeen,
      changelogMd,
      slides, // null 或 { version, slides[] }
    };
  });

  ipcMainRef.handle('release-notes:get-version', async (_evt, version) => {
    const changelogMd = loader.readReleaseNotes(version);
    if (changelogMd === null) return null;
    const slides = loader.readSlides(version);
    return { version, changelogMd, slides };
  });

  ipcMainRef.handle('release-notes:mark-seen', async (_evt, version) => {
    try {
      stateStore.setLastSeenRelease(version, Date.now());
      return { ok: true, version };
    } catch (err) {
      log.warn('setLastSeenRelease failed:', { msg: err && err.message });
      return { ok: false, version };
    }
  });
}

module.exports = { registerReleaseNotes };
