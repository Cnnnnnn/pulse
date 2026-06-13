/**
 * src/renderer/log.js
 *
 * Renderer 日志入口 — 跟 src/ai-sessions/session-log.js 同一风格.
 *
 * 默认: 生产静默, 开发 (import.meta.env.DEV) 走 console.
 * 调用方: import { log } from '../log.js' (或 store-utils 包装).
 */

const IS_DEV =
  typeof process !== "undefined" &&
  process.env &&
  process.env.NODE_ENV !== "production";

function noop() {}

function consoleBackend(prefix) {
  const fmt = (level) => (msg, ...rest) => {
    if (typeof console === "undefined" || !console[level]) return;
    const tag = prefix ? `${prefix} ` : "";
    if (rest.length > 0) console[level](`${tag}${msg}`, ...rest);
    else console[level](`${tag}${msg}`);
  };
  return { info: fmt("log"), warn: fmt("warn"), error: fmt("error") };
}

const SILENT = { info: noop, warn: noop, error: noop };

/**
 * @param {string} [prefix] e.g. "[store]"
 * @param {{ info?: Function, warn?: Function, error?: Function }} [backend]
 */
function makeLog(prefix, backend) {
  const be = backend || (IS_DEV ? consoleBackend(prefix) : SILENT);
  return {
    info: (msg, ...rest) => be.info(msg, ...rest),
    warn: (msg, ...rest) => be.warn(msg, ...rest),
    error: (msg, ...rest) => be.error(msg, ...rest),
  };
}

const defaultLog = makeLog();

/**
 * @param {string} prefix
 * @param {{ info?: Function, warn?: Function, error?: Function }} [backend]
 */
function taggedLog(prefix, backend) {
  return makeLog(prefix, backend || (IS_DEV ? consoleBackend(prefix) : SILENT));
}

export { defaultLog as log, taggedLog };
