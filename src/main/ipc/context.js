/**
 * src/main/ipc/context.js — IPC handler 共享上下文 (safeHandle / sendToRenderer).
 */

const { ipcMain } = require("electron");
const { mainLog } = require("../log");

/**
 * @param {object} deps
 * @returns {object} ctx
 */
function createIpcContext(deps) {
  const {
    getConfig,
    pool,
    getWindow,
    onCheckComplete,
    getCachedState,
    getFundScheduler,
  } = deps;

  function fundScheduler() {
    return typeof getFundScheduler === "function" ? getFundScheduler() : null;
  }

  function sendToRenderer(channel, payload) {
    const w = getWindow && getWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload);
    }
  }

  function threwResponse(err, extra = {}) {
    return { ok: false, reason: "threw", error: err && err.message, ...extra };
  }

  function safeHandle(channel, fn, opts = {}) {
    const { onError, logMeta, log = true, logIf } = opts;
    ipcMain.handle(channel, async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        if (log && (!logIf || logIf(err))) {
          const meta =
            typeof logMeta === "function" ? logMeta(...args) : logMeta || {};
          mainLog.warn(`[ipc] ${channel} threw`, {
            ...meta,
            msg: err && err.message,
          });
        }
        if (onError) return onError(err, ...args);
        return threwResponse(err);
      }
    });
  }

  return {
    getConfig,
    pool,
    getWindow,
    onCheckComplete,
    getCachedState,
    fundScheduler,
    sendToRenderer,
    threwResponse,
    safeHandle,
  };
}

module.exports = { createIpcContext };
