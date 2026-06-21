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
const fs = require('node:fs');
const path = require('node:path');

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

/**
 * @typedef {object} AuditEntry
 * @property {string} file
 * @property {number} line
 * @property {string} code
 * @property {string|null} var
 * @property {number|null} ms
 * @property {boolean} hasCleanup
 * @property {'clean'|'orphan'|'debounce'|'dup-schedule'} kind
 */

/**
 * @typedef {object} AuditSummary
 * @property {number} total
 * @property {number} clean
 * @property {number} orphan
 * @property {number} debounce
 * @property {number} dupSchedule
 * @property {AuditEntry[]} entries
 * @property {string[]} skipped
 */

/**
 * Scan .js files under rootDir for setInterval / setTimeout usage and
 * classify each as clean / orphan / debounce / dup-schedule.
 *
 * Pure CommonJS, no mainLog dependency — caller (src/main/index.js)
 * is responsible for writing the summary to mainLog if it wants.
 *
 * @param {string} rootDir
 * @param {{fixturesOnly?:boolean,logger?:{info:function,warn:function}}} [opts]
 * @returns {AuditSummary}
 */
function auditTimers(rootDir, opts) {
  const logger = (opts && opts.logger) || null;
  const summary = {
    total: 0,
    clean: 0,
    orphan: 0,
    debounce: 0,
    dupSchedule: 0,
    entries: [],
    skipped: [],
  };
  if (!rootDir || typeof rootDir !== 'string') return summary;

  let files;
  try {
    files = fs.readdirSync(rootDir).filter((f) => f.endsWith('.js'));
  } catch (err) {
    if (logger) logger.warn(`[timer-registry] audit: readdir failed: ${err && err.message}`);
    return summary;
  }

  for (const file of files) {
    const full = path.join(rootDir, file);
    let content;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch (err) {
      summary.skipped.push(file);
      if (logger) logger.warn(`[timer-registry] audit: skip ${file}: ${err && err.message}`);
      continue;
    }
    const lines = content.split('\n');

    // 1) collect all setInterval / setTimeout sites
    const sites = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (line.startsWith('//') || line.startsWith('*')) continue; // comments

      const m = line.match(/(setInterval|setTimeout)\s*\(/);
      if (!m) continue;
      // ignore 1-shot microtask timeouts (ms arg of 0/1/<5)
      const msMatch = line.match(/,\s*(\d+)\s*\)/);
      const ms = msMatch ? Number(msMatch[1]) : null;
      if (m[1] === 'setTimeout' && ms !== null && ms < 5) continue;

      // try to extract var name: const|let|var X = setInterval(...)
      const varMatch = line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:setInterval|setTimeout)/);
      const varName = varMatch ? varMatch[1] : null;

      sites.push({
        file,
        line: i + 1,
        code: raw.trim(),
        var: varName,
        ms,
        func: m[1],
      });
    }

    // 2) classify each site
    for (const site of sites) {
      // Look 50 lines ahead for clearInterval(var) or clearTimeout(var)
      let hasCleanup = false;
      const searchLimit = Math.min(lines.length, site.line + 50);
      if (site.var) {
        for (let j = site.line; j < searchLimit; j++) {
          const look = lines[j];
          if (
            (look.includes(`clearInterval(${site.var})`) ||
              look.includes(`clearTimeout(${site.var})`)) &&
            !look.trim().startsWith('//')
          ) {
            hasCleanup = true;
            break;
          }
        }
      }

      // Determine kind
      let kind;
      if (hasCleanup) {
        kind = 'clean';
      } else if (site.func === 'setTimeout' && site.var) {
        // debounce: same var assigned multiple times across the file
        const sameVarCount = sites.filter(
          (s) => s.var === site.var && s.func === 'setTimeout',
        ).length;
        if (sameVarCount >= 2) kind = 'debounce';
        else kind = 'orphan';
      } else if (site.func === 'setInterval' && site.var) {
        // dup-schedule: same var assigned setInterval >=2 times without clear
        const sameVarCount = sites.filter(
          (s) => s.var === site.var && s.func === 'setInterval',
        ).length;
        if (sameVarCount >= 2) kind = 'dup-schedule';
        else kind = 'orphan';
      } else {
        // anonymous (no var) → orphan
        kind = 'orphan';
      }

      const entry = {
        file,
        line: site.line,
        code: site.code,
        var: site.var,
        ms: site.ms,
        hasCleanup,
        kind,
      };
      summary.entries.push(entry);
      summary.total += 1;
      if (kind === 'clean') summary.clean += 1;
      else if (kind === 'orphan') summary.orphan += 1;
      else if (kind === 'debounce') summary.debounce += 1;
      else if (kind === 'dup-schedule') summary.dupSchedule += 1;

      if (logger) {
        if (kind === 'orphan') {
          logger.info(
            `[timer-registry] [orphan] ${file}:${site.line} ${site.func} ${site.ms != null ? site.ms + 'ms ' : ''}(no clear found in 50 lines)`,
          );
        } else if (kind === 'dup-schedule') {
          logger.info(
            `[timer-registry] [dup-schedule] ${file}:${site.line} ${site.func} ${site.ms != null ? site.ms + 'ms ' : ''}(var ${site.var} reassigned without prior clear)`,
          );
        } else if (kind === 'debounce') {
          logger.info(
            `[timer-registry] [debounce] ${file}:${site.line} ${site.func} ${site.ms != null ? site.ms + 'ms ' : ''}`,
          );
        }
      }
    }
  }

  if (logger) {
    logger.info(
      `[timer-registry] audit: total=${summary.total} clean=${summary.clean} orphan=${summary.orphan} debounce=${summary.debounce} dupSchedule=${summary.dupSchedule}`,
    );
  }
  return summary;
}

module.exports = {
  setManagedInterval,
  setManagedTimeout,
  clearManaged,
  clearAllManaged,
  auditTimers,
  getStats,
  listManaged,
  __resetForTest,
};
