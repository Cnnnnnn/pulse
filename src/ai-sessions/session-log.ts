/**
 * src/ai-sessions/session-log.ts
 *
 * 可注入 logger — ai-sessions detector 默认静默, main wiring 传入 mainLog.
 */

export const SILENT_LOG = Object.freeze({
  info(_msg?: any) {},
  warn(_msg?: any) {},
  error(_msg?: any) {},
});

/**
 * @param {string} prefix
 * @param {{ info?: Function, warn?: Function, error?: Function }} [backend]
 */
export function prefixLog(prefix: any, backend: any = SILENT_LOG) {
  const p = prefix.endsWith(" ") ? prefix : `${prefix} `;
  return {
    info: (msg: any) => backend.info && backend.info(`${p}${msg}`),
    warn: (msg: any) => backend.warn && backend.warn(`${p}${msg}`),
    error: (msg: any) => backend.error && backend.error(`${p}${msg}`),
  };
}

