/**
 * src/ai-sessions/session-log.js
 *
 * 可注入 logger — ai-sessions detector 默认静默, main wiring 传入 mainLog.
 */

const SILENT_LOG = Object.freeze({
  info() {},
  warn() {},
  error() {},
});

/**
 * @param {string} prefix
 * @param {{ info?: Function, warn?: Function, error?: Function }} [backend]
 */
function prefixLog(prefix, backend = SILENT_LOG) {
  const p = prefix.endsWith(" ") ? prefix : `${prefix} `;
  return {
    info: (msg) => backend.info && backend.info(`${p}${msg}`),
    warn: (msg) => backend.warn && backend.warn(`${p}${msg}`),
    error: (msg) => backend.error && backend.error(`${p}${msg}`),
  };
}

module.exports = { SILENT_LOG, prefixLog };
