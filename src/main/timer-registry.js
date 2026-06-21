/**
 * src/main/timer-registry.js
 *
 * Phase Q5 v1: Lightweight timer registry.
 *
 * Wraps Node's setInterval / setTimeout so every managed timer is
 * recorded in an in-memory array. Lets the rest of main land a
 * `clearAllManaged()` safety net on app quit, and gives `auditTimers`
 * a consistent way to scan for cleanup patterns.
 *
 * NOT a global interceptor — calling code opts in via
 * setManagedInterval / setManagedTimeout. Existing call sites are
 * intentionally untouched in v1 (spec §2.3).
 *
 * No Electron dependency — pure CommonJS, vitest-requireable.
 */

'use strict';

const timers = require('node:timers');

/** @type {Array<{id:number,type:'interval'|'timeout',label:string,file:string|null,line:number|null,startedAt:number,handle:object}>} */
const _entries = [];

let _nextId = 1;

/**
 * @typedef {object} ManagedHandle
 * @property {number} id
 * @property {function():void} clear
 */

/**
 * @param {function():void} fn
 * @param {number} ms
 * @param {{label?:string,file?:string,line?:number}} [meta]
 * @returns {ManagedHandle}
 */
function setManagedInterval(fn, ms, meta) {
  const id = _nextId++;
  const native = timers.setInterval(fn, ms);
  const entry = {
    id,
    type: 'interval',
    label: (meta && meta.label) || 'anon',
    file: (meta && meta.file) || null,
    line: (meta && meta.line) || null,
    startedAt: Date.now(),
    handle: native,
  };
  _entries.push(entry);
  return {
    id,
    clear: () => clearManaged({ id }),
  };
}

/**
 * @param {function():void} fn
 * @param {number} ms
 * @param {{label?:string,file?:string,line?:number}} [meta]
 * @returns {ManagedHandle}
 */
function setManagedTimeout(fn, ms, meta) {
  const id = _nextId++;
  const native = timers.setTimeout(fn, ms);
  const entry = {
    id,
    type: 'timeout',
    label: (meta && meta.label) || 'anon',
    file: (meta && meta.file) || null,
    line: (meta && meta.line) || null,
    startedAt: Date.now(),
    handle: native,
  };
  _entries.push(entry);
  return {
    id,
    clear: () => clearManaged({ id }),
  };
}

/**
 * @param {{id:number}|ManagedHandle} handleOrId
 * @returns {boolean} true if a live entry was cleared
 */
function clearManaged(handleOrId) {
  if (!handleOrId || typeof handleOrId.id !== 'number') return false;
  const idx = _entries.findIndex((e) => e.id === handleOrId.id);
  if (idx < 0) return false;
  const entry = _entries[idx];
  try {
    if (entry.type === 'interval') timers.clearInterval(entry.handle);
    else timers.clearTimeout(entry.handle);
  } catch {
    /* swallow — stale native handle should never throw to caller */
  }
  _entries.splice(idx, 1);
  return true;
}

/**
 * @param {string} [labelPrefix] — when provided, only clear entries whose
 *   label starts with this string. When undefined, clears ALL managed timers.
 */
function clearAllManaged(labelPrefix) {
  if (typeof labelPrefix !== 'string') {
    const snapshot = _entries.slice();
    _entries.length = 0;
    for (const entry of snapshot) {
      try {
        if (entry.type === 'interval') timers.clearInterval(entry.handle);
        else timers.clearTimeout(entry.handle);
      } catch {
        /* swallow */
      }
    }
    return snapshot.length;
  }
  const kept = [];
  const cleared = [];
  for (const entry of _entries) {
    if (entry.label.startsWith(labelPrefix)) cleared.push(entry);
    else kept.push(entry);
  }
  _entries.length = 0;
  _entries.push(...kept);
  for (const entry of cleared) {
    try {
      if (entry.type === 'interval') timers.clearInterval(entry.handle);
      else timers.clearTimeout(entry.handle);
    } catch {
      /* swallow */
    }
  }
  return cleared.length;
}

/**
 * @returns {{count:number,byType:{interval:number,timeout:number}}}
 */
function getStats() {
  const byType = { interval: 0, timeout: 0 };
  for (const e of _entries) byType[e.type] += 1;
  return { count: _entries.length, byType };
}

/**
 * @returns {Array<{id:number,type:'interval'|'timeout',label:string,file:string|null,line:number|null,startedAt:number}>}
 */
function listManaged() {
  return _entries.map((e) => ({
    id: e.id,
    type: e.type,
    label: e.label,
    file: e.file,
    line: e.line,
    startedAt: e.startedAt,
  }));
}

/** @internal — used by tests to reset between cases. */
function __resetForTest() {
  // Clear any active native timers first to avoid leakage across tests.
  for (const entry of _entries) {
    try {
      if (entry.type === 'interval') timers.clearInterval(entry.handle);
      else timers.clearTimeout(entry.handle);
    } catch {
      /* noop */
    }
  }
  _entries.length = 0;
  _nextId = 1;
}

module.exports = {
  setManagedInterval,
  setManagedTimeout,
  clearManaged,
  clearAllManaged,
  getStats,
  listManaged,
  __resetForTest,
};
