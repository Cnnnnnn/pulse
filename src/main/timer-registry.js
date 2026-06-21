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

/** @type {Array<{id:number,type:'interval'|'timeout',label:string,file:string|null,line:number|null,startedAt:number}>} */
const _entries = [];

let _nextId = 1;

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
  return _entries.slice();
}

/** @internal — used by tests to reset between cases. */
function __resetForTest() {
  _entries.length = 0;
  _nextId = 1;
}

module.exports = {
  getStats,
  listManaged,
  __resetForTest,
};
