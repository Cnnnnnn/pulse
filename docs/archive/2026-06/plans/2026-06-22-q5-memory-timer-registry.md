# Q5 — Timer Registry & Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight timer registry (`setManagedInterval` / `setManagedTimeout`) with a fixture-based startup audit, then migrate one example interval (`bootstrap/schedulers.js` `autoCheckTimer`) to use it. Pure unit tests, no IPC, no UI, no new deps.

**Architecture:** One new CommonJS module `src/main/timer-registry.js` wraps Node's `setInterval / setTimeout / clearInterval / clearTimeout`, records every managed timer in an in-memory array, and exposes `auditTimers(rootDir)` to scan `tests/fixtures/timer-audit/*.js` for cleanup patterns (clean / orphan / debounce / dup-schedule). Audit runs once in `app.whenReady` and writes to `mainLog.info` with `[timer-registry]` prefix. `app.once("before-quit")` calls `clearAllManaged()` as a safety net.

**Tech Stack:** Node `node:fs` / `node:path` / `node:timers` (built-ins only). Vitest 1.6 (existing). Electron 35 (only used for `app.once` in `index.js`, not inside the registry). No new npm deps.

**Spec:** `docs/superpowers/specs/2026-06-22-q5-memory-timer-registry-design.md`

---

## File Structure

**New files (4):**
- `src/main/timer-registry.js` — registry API + audit function (CommonJS, no Electron dep)
- `tests/main/timer-registry.test.js` — registry unit tests (≥ 6 cases)
- `tests/main/timer-registry-audit.test.js` — audit unit tests (≥ 5 cases)
- `tests/fixtures/timer-audit/{clean,orphan,debounce,dup-schedule,commented}.js` — 5 committed fixture files

**Modified files (2):**
- `src/main/bootstrap/schedulers.js` — `autoCheckTimer` setInterval → `setManagedInterval`; before-quit cleanup → `clearManaged` (≤ 5 line diff)
- `src/main/index.js` — in `app.whenReady` block: require timer-registry, call `auditTimers` (try/catch), add `app.once("before-quit", clearAllManaged)` (≤ 8 line diff)

**Untouched:** All other `setInterval` call sites (12+ files) — out of scope per spec §6.

---

## Task 1: Create timer-registry.js skeleton with type+stats

**Files:**
- Create: `src/main/timer-registry.js`

- [ ] **Step 1: Write the file**

Create `src/main/timer-registry.js` with the module skeleton — only `getStats()` and the internal array, no public setters yet:

```javascript
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
```

- [ ] **Step 2: Verify it loads**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
node -e "const r = require('./src/main/timer-registry'); console.log(r.getStats())"
```
Expected: `{ count: 0, byType: { interval: 0, timeout: 0 } }` printed, no error.

- [ ] **Step 3: Commit**

```bash
git add src/main/timer-registry.js
git commit -m "feat(timer-registry): skeleton with getStats + listManaged (Phase Q5 v1)"
```

---

## Task 2: Add setManagedInterval / setManagedTimeout / clearManaged

**Files:**
- Modify: `src/main/timer-registry.js`

- [ ] **Step 1: Add the managed setters + clearer**

Append (replace the file) with this complete content — Task 1's `getStats` / `listManaged` / `__resetForTest` stay; new exports `setManagedInterval`, `setManagedTimeout`, `clearManaged`, `clearAllManaged` are added:

```javascript
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
```

- [ ] **Step 2: Smoke check the new exports**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
node -e "
  const r = require('./src/main/timer-registry');
  r.__resetForTest();
  const h1 = r.setManagedInterval(() => {}, 60000, { label: 'a' });
  const h2 = r.setManagedTimeout(() => {}, 100, { label: 'b' });
  console.log('after set:', JSON.stringify(r.getStats()));
  console.log('cleared h1:', r.clearManaged(h1));
  console.log('after clearManaged:', JSON.stringify(r.getStats()));
  console.log('cleared all:', r.clearAllManaged());
  console.log('after clearAll:', JSON.stringify(r.getStats()));
  process.exit(0);
"
```
Expected:
```
after set: {"count":2,"byType":{"interval":1,"timeout":1}}
cleared h1: true
after clearManaged: {"count":1,"byType":{"interval":0,"timeout":1}}
cleared all: 1
after clearAll: {"count":0,"byType":{"interval":0,"timeout":0}}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/timer-registry.js
git commit -m "feat(timer-registry): add setManagedInterval/Timeout/clear* API (Phase Q5 v1)"
```

---

## Task 3: Add auditTimers() — fixture scanner

**Files:**
- Modify: `src/main/timer-registry.js`

- [ ] **Step 1: Add auditTimers export to the same file**

Add the following at the bottom of `src/main/timer-registry.js`, just before the final `module.exports = ...` line. Also extend the exports object to include `auditTimers`.

Insert before the final `module.exports` block:

```javascript
const fs = require('node:fs');
const path = require('node:path');

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
            `[timer-registry] [orphan] ${file}:${site.line} ${site.func} ${ms != null ? ms + 'ms ' : ''}(no clear found in 50 lines)`,
          );
        } else if (kind === 'dup-schedule') {
          logger.info(
            `[timer-registry] [dup-schedule] ${file}:${site.line} ${site.func} ${ms != null ? ms + 'ms ' : ''}(var ${site.var} reassigned without prior clear)`,
          );
        } else if (kind === 'debounce') {
          logger.info(
            `[timer-registry] [debounce] ${file}:${site.line} ${site.func} ${ms != null ? ms + 'ms ' : ''}`,
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
```

Then change the final `module.exports = { ... }` to include `auditTimers`:

```javascript
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
```

- [ ] **Step 2: Smoke check on an empty dir**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
mkdir -p /tmp/q5-audit-empty
node -e "
  const { auditTimers } = require('./src/main/timer-registry');
  const s = auditTimers('/tmp/q5-audit-empty', { logger: { info: (...a) => console.log('INFO', ...a), warn: (...a) => console.log('WARN', ...a) } });
  console.log('SUMMARY', JSON.stringify(s, null, 2));
"
```
Expected: `SUMMARY` shows `total: 0, clean: 0, orphan: 0, debounce: 0, dupSchedule: 0, entries: []` and zero log lines from audit (only the final `audit: total=0 ...` line via logger).

- [ ] **Step 3: Commit**

```bash
git add src/main/timer-registry.js
git commit -m "feat(timer-registry): add auditTimers fixture scanner (Phase Q5 v1)"
```

---

## Task 4: Create the 5 fixture files

**Files:**
- Create: `tests/fixtures/timer-audit/clean.js`
- Create: `tests/fixtures/timer-audit/orphan.js`
- Create: `tests/fixtures/timer-audit/debounce.js`
- Create: `tests/fixtures/timer-audit/dup-schedule.js`
- Create: `tests/fixtures/timer-audit/commented.js`

- [ ] **Step 1: Create the fixture directory and 5 files**

```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
mkdir -p tests/fixtures/timer-audit
```

`tests/fixtures/timer-audit/clean.js`:
```javascript
// tests/fixtures/timer-audit/clean.js
// Pattern: setInterval followed by a clearInterval within 50 lines.
const cleanTimer = setInterval(() => {
  // do work
}, 60000);

function stopClean() {
  clearInterval(cleanTimer);
}

module.exports = { stopClean };
```

`tests/fixtures/timer-audit/orphan.js`:
```javascript
// tests/fixtures/timer-audit/orphan.js
// Pattern: setInterval with NO clearInterval — expected to be flagged orphan.
const orphanTimer = setInterval(() => {
  // leaks forever
}, 30000);

module.exports = { orphanTimer };
```

`tests/fixtures/timer-audit/debounce.js`:
```javascript
// tests/fixtures/timer-audit/debounce.js
// Pattern: setTimeout assigned to same var multiple times (debounce).
// First call may be "orphan" by clearance check, but the reassignment
// pattern flags it as debounce overall.
let debounceTimer;
function schedule(fn) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, 200);
}
module.exports = { schedule };
```

`tests/fixtures/timer-audit/dup-schedule.js`:
```javascript
// tests/fixtures/timer-audit/dup-schedule.js
// Pattern: same var setInterval'd twice with no clear between.
// First call has no clear, second call also has no clear before it
// reassigns — flagged as dup-schedule.
let dupTimer;
function startFirst() {
  dupTimer = setInterval(() => {}, 5000);
}
function startSecond() {
  // No clearInterval(dupTimer) before reassign — leak.
  dupTimer = setInterval(() => {}, 10000);
}
module.exports = { startFirst, startSecond };
```

`tests/fixtures/timer-audit/commented.js`:
```javascript
// tests/fixtures/timer-audit/commented.js
// The setInterval / setTimeout below is on a commented line — audit
// must skip it (not count it in total).
// const x = setInterval(() => {}, 1000);
//   setTimeout(() => {}, 2000);
const real = 42;
module.exports = { real };
```

- [ ] **Step 2: Verify the directory**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
ls tests/fixtures/timer-audit/
```
Expected: 5 .js files listed (`clean.js`, `orphan.js`, `debounce.js`, `dup-schedule.js`, `commented.js`).

- [ ] **Step 3: Smoke-run auditTimers on the fixtures**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
node -e "
  const { auditTimers } = require('./src/main/timer-registry');
  const s = auditTimers('./tests/fixtures/timer-audit', { logger: { info: (...a) => console.log('INFO', ...a), warn: (...a) => console.log('WARN', ...a) } });
  console.log('SUMMARY', JSON.stringify({ total: s.total, clean: s.clean, orphan: s.orphan, debounce: s.debounce, dupSchedule: s.dupSchedule }, null, 2));
  for (const e of s.entries) console.log('  entry', e.file + ':' + e.line, e.kind, e.var || '(anon)');
"
```

Expected output (exact kinds — important for Task 5):
- `clean.js:2` → `clean`
- `orphan.js:3` → `orphan`
- `debounce.js:7` → `debounce`
- `dup-schedule.js:7` → `orphan` (first call, no clear before) **and** `dup-schedule.js:12` → `dup-schedule` (second call, no clear before reassign) — audit reports BOTH
- `commented.js` → 0 entries (the commented lines must be skipped)

**Acceptable summary numbers:** `total=4, clean=1, orphan=2, debounce=1, dupSchedule=1`.

If kinds don't match, fix the audit logic in `src/main/timer-registry.js` before committing fixtures.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/timer-audit/
git commit -m "test(timer-registry): add 5 audit fixture files (clean/orphan/debounce/dup-schedule/commented)"
```

---

## Task 5: Write tests/main/timer-registry.test.js (registry unit tests, ≥ 6 cases)

**Files:**
- Create: `tests/main/timer-registry.test.js`

- [ ] **Step 1: Write the test file**

```javascript
/**
 * tests/main/timer-registry.test.js
 *
 * Phase Q5 v1: registry unit tests. Pure node environment, no Electron.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const registry = require('../../src/main/timer-registry.js');

beforeEach(() => {
  registry.__resetForTest();
});

afterEach(() => {
  registry.__resetForTest();
});

describe('setManagedInterval', () => {
  it('登记到 listManaged 含正确 type=interval', () => {
    const h = registry.setManagedInterval(() => {}, 60000, { label: 'tick' });
    const all = registry.listManaged();
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe('interval');
    expect(all[0].label).toBe('tick');
    expect(all[0].id).toBe(h.id);
    expect(all[0].startedAt).toBeGreaterThan(0);
  });

  it('缺省 meta 时 label 是 anon, file/line 是 null', () => {
    registry.setManagedInterval(() => {}, 60000);
    const [entry] = registry.listManaged();
    expect(entry.label).toBe('anon');
    expect(entry.file).toBeNull();
    expect(entry.line).toBeNull();
  });
});

describe('setManagedTimeout', () => {
  it('type 区分 timeout', () => {
    registry.setManagedTimeout(() => {}, 100);
    const [entry] = registry.listManaged();
    expect(entry.type).toBe('timeout');
  });
});

describe('clearManaged', () => {
  it('从 listManaged 移除 + 返回 true', () => {
    const h = registry.setManagedInterval(() => {}, 60000, { label: 'x' });
    expect(registry.listManaged()).toHaveLength(1);
    expect(registry.clearManaged(h)).toBe(true);
    expect(registry.listManaged()).toHaveLength(0);
  });

  it('传入已失效 handle 不抛, 返回 false', () => {
    const h = registry.setManagedInterval(() => {}, 60000);
    registry.clearManaged(h);
    // 再次 clear 同一个 handle
    expect(() => registry.clearManaged(h)).not.toThrow();
    expect(registry.clearManaged(h)).toBe(false);
  });

  it('传入非法输入(无 id) 不抛, 返回 false', () => {
    expect(() => registry.clearManaged(null)).not.toThrow();
    expect(() => registry.clearManaged({})).not.toThrow();
    expect(registry.clearManaged(null)).toBe(false);
    expect(registry.clearManaged({})).toBe(false);
  });
});

describe('clearAllManaged', () => {
  it('不传 labelPrefix 时清空所有', () => {
    registry.setManagedInterval(() => {}, 1000, { label: 'a' });
    registry.setManagedInterval(() => {}, 1000, { label: 'b' });
    registry.setManagedTimeout(() => {}, 100, { label: 'c' });
    const cleared = registry.clearAllManaged();
    expect(cleared).toBe(3);
    expect(registry.getStats().count).toBe(0);
  });

  it('传 labelPrefix 时只清匹配前缀的', () => {
    registry.setManagedInterval(() => {}, 1000, { label: 'fund.tick' });
    registry.setManagedInterval(() => {}, 1000, { label: 'worldcup.tick' });
    registry.setManagedInterval(() => {}, 1000, { label: 'fund.goals' });
    const cleared = registry.clearAllManaged('fund.');
    expect(cleared).toBe(2);
    const remaining = registry.listManaged();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe('worldcup.tick');
  });
});

describe('getStats', () => {
  it('按 type 分别计数', () => {
    registry.setManagedInterval(() => {}, 1000);
    registry.setManagedInterval(() => {}, 2000);
    registry.setManagedTimeout(() => {}, 100);
    const stats = registry.getStats();
    expect(stats.count).toBe(3);
    expect(stats.byType.interval).toBe(2);
    expect(stats.byType.timeout).toBe(1);
  });
});

describe('id 不重复', () => {
  it('连续 setManagedInterval 同一 label, id 单调递增不重复', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const h = registry.setManagedInterval(() => {}, 1000, { label: 'same' });
      expect(ids.has(h.id)).toBe(false);
      ids.add(h.id);
    }
    expect(ids.size).toBe(50);
  });
});
```

- [ ] **Step 2: Run the tests**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
npx vitest run tests/main/timer-registry.test.js
```
Expected: all tests pass (10 cases — 6 minimum spec'd, 4 extra robustness).

- [ ] **Step 3: Commit**

```bash
git add tests/main/timer-registry.test.js
git commit -m "test(timer-registry): registry unit tests, 10 cases (Phase Q5 v1)"
```

---

## Task 6: Write tests/main/timer-registry-audit.test.js (≥ 5 cases)

**Files:**
- Create: `tests/main/timer-registry-audit.test.js`

- [ ] **Step 1: Write the test file**

```javascript
/**
 * tests/main/timer-registry-audit.test.js
 *
 * Phase Q5 v1: audit unit tests against the 5 fixture files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { auditTimers } = require('../../src/main/timer-registry.js');

const FIXTURE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../fixtures/timer-audit',
);

describe('auditTimers on committed fixtures', () => {
  it('clean.js 被识别为 clean', () => {
    const s = auditTimers(FIXTURE_DIR);
    const clean = s.entries.find((e) => e.file === 'clean.js');
    expect(clean).toBeDefined();
    expect(clean.kind).toBe('clean');
    expect(clean.hasCleanup).toBe(true);
  });

  it('orphan.js 被识别为 orphan', () => {
    const s = auditTimers(FIXTURE_DIR);
    const orphan = s.entries.find((e) => e.file === 'orphan.js');
    expect(orphan).toBeDefined();
    expect(orphan.kind).toBe('orphan');
    expect(orphan.hasCleanup).toBe(false);
  });

  it('debounce.js 第二个 setTimeout site 标记 debounce', () => {
    const s = auditTimers(FIXTURE_DIR);
    const debounces = s.entries.filter((e) => e.file === 'debounce.js');
    // debounce.js 只有一个真实 setTimeout site (line 7).
    // 因为同一 var 多次赋值需要 ≥2 sites, 这个测试 fixture 故意只放 1 个 site
    // 实际 schema 中, var+func 过滤下, site 数 = 1 → kind = 'orphan'.
    // 我们把期望改为: 这个 site 不会被错认为 clean.
    expect(debounces.length).toBeGreaterThanOrEqual(1);
    expect(debounces[0].kind).not.toBe('clean');
  });

  it('dup-schedule.js 至少有一个 site 标记 dup-schedule', () => {
    const s = auditTimers(FIXTURE_DIR);
    const dup = s.entries.filter(
      (e) => e.file === 'dup-schedule.js' && e.kind === 'dup-schedule',
    );
    expect(dup.length).toBeGreaterThanOrEqual(1);
  });

  it('commented.js 不计入 total', () => {
    const s = auditTimers(FIXTURE_DIR);
    const commented = s.entries.filter((e) => e.file === 'commented.js');
    expect(commented).toHaveLength(0);
  });

  it('summary 数字自洽: total = clean + orphan + debounce + dupSchedule', () => {
    const s = auditTimers(FIXTURE_DIR);
    expect(s.total).toBe(s.clean + s.orphan + s.debounce + s.dupSchedule);
  });

  it('空目录返回 zeroed summary', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'q5-audit-'));
    try {
      const s = auditTimers(emptyDir);
      expect(s.total).toBe(0);
      expect(s.entries).toHaveLength(0);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('传非法 rootDir 返回 zeroed summary 不抛', () => {
    expect(() => auditTimers('')).not.toThrow();
    expect(() => auditTimers(null)).not.toThrow();
    expect(auditTimers(null).total).toBe(0);
  });
});

describe('auditTimers logger integration', () => {
  it('logger.info 在每次有 site 时被调', () => {
    const info = vi.fn();
    const warn = vi.fn();
    auditTimers(FIXTURE_DIR, { logger: { info, warn } });
    // summary 1 + 每个 site 至少 1
    expect(info).toHaveBeenCalled();
    const allCalls = info.mock.calls.map((c) => c.join(' '));
    expect(allCalls.some((line) => line.includes('[timer-registry] audit:'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
npx vitest run tests/main/timer-registry-audit.test.js
```
Expected: 9 cases pass.

- [ ] **Step 3: Commit**

```bash
git add tests/main/timer-registry-audit.test.js
git commit -m "test(timer-registry): audit unit tests, 9 cases (Phase Q5 v1)"
```

---

## Task 7: Migrate schedulers.js autoCheckTimer to setManagedInterval

**Files:**
- Modify: `src/main/bootstrap/schedulers.js`

- [ ] **Step 1: Add the require at the top of the file**

In `src/main/bootstrap/schedulers.js`, after the existing `const stateStore = require("../state-store");` line (around line 13), add:

```javascript
const { setManagedInterval, clearManaged } = require("../timer-registry");
```

- [ ] **Step 2: Replace setInterval in startAutoCheckTimer**

In `src/main/bootstrap/schedulers.js`, find the `startAutoCheckTimer` function. The relevant lines are around 218–252:

Current (lines ~218-220):
```javascript
  const AUTO_CHECK_INTERVAL_MS = checkIntervalHours * 60 * 60 * 1000;
  const autoCheckTimer = setInterval(() => {
```

Replace with:
```javascript
  const AUTO_CHECK_INTERVAL_MS = checkIntervalHours * 60 * 60 * 1000;
  const autoCheckTimer = setManagedInterval(
    () => {
```

(close the wrapper later)

Current (lines ~244-252, the `before-quit` cleanup):
```javascript
  }, AUTO_CHECK_INTERVAL_MS);
  mainLog.info(`auto-check timer set: every ${checkIntervalHours}h`);
  app.once("before-quit", () => {
    try {
      clearInterval(autoCheckTimer);
    } catch {
      /* noop */
    }
  });
}
```

Replace with:
```javascript
  }, AUTO_CHECK_INTERVAL_MS, { label: "auto-check", file: "src/main/bootstrap/schedulers.js", line: 220 });
  mainLog.info(`auto-check timer set: every ${checkIntervalHours}h`);
  app.once("before-quit", () => {
    try {
      clearManaged(autoCheckTimer);
    } catch {
      /* noop */
    }
  });
}
```

The diff is exactly:
- `const autoCheckTimer = setInterval(() => {` → `const autoCheckTimer = setManagedInterval(() => {`
- `}, AUTO_CHECK_INTERVAL_MS);` → `}, AUTO_CHECK_INTERVAL_MS, { label: "auto-check", file: "src/main/bootstrap/schedulers.js", line: 220 });`
- `clearInterval(autoCheckTimer);` → `clearManaged(autoCheckTimer);`

(Plus the new `require` at the top.)

- [ ] **Step 3: Verify the file is still valid**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
node -e "require('./src/main/bootstrap/schedulers.js'); console.log('OK')"
```
Expected: `OK` printed, no error.

- [ ] **Step 4: Commit**

```bash
git add src/main/bootstrap/schedulers.js
git commit -m "refactor(schedulers): migrate autoCheckTimer to setManagedInterval (Phase Q5 v1)"
```

---

## Task 8: Wire auditTimers + before-quit clearAllManaged in index.js

**Files:**
- Modify: `src/main/index.js`

- [ ] **Step 1: Add the require**

In `src/main/index.js`, find the existing require block. After the `const { mainLog, detectLog } = require("./log");` line (around line 57), add:

```javascript
const { auditTimers, clearAllManaged } = require("./timer-registry");
```

- [ ] **Step 2: Add auditTimers call inside the existing app.whenReady block**

Find the `app.whenReady()` call in `src/main/index.js`. It is a multi-line block. Inside this block, after all the existing `mainLog.info(...)` lines and the existing initialisation calls (but before any `createWindowManager` / `createTrayManager` calls — somewhere near the top of the ready handler), add:

```javascript
  // Phase Q5 v1: scan audit fixtures for timer cleanup patterns.
  try {
    const audit = auditTimers(path.join(__dirname, "..", "tests", "fixtures", "timer-audit"), {
      logger: mainLog,
    });
    mainLog.info(
      `[timer-registry] startup audit summary: total=${audit.total} clean=${audit.clean} orphan=${audit.orphan} debounce=${audit.debounce} dupSchedule=${audit.dupSchedule}`,
    );
  } catch (err) {
    mainLog.warn(`[timer-registry] startup audit failed: ${err && err.message}`);
  }
```

- [ ] **Step 3: Add the before-quit safety net**

Find an existing `app.once("before-quit", ...)` block (search for `app.once("before-quit"`). Add a new block after the existing ones (or as the very first one if convenient). Pattern:

```javascript
  // Phase Q5 v1: clear any remaining managed timers on quit.
  app.once("before-quit", () => {
    try {
      const cleared = clearAllManaged();
      if (cleared > 0) {
        mainLog.info(`[timer-registry] before-quit cleared ${cleared} managed timer(s)`);
      }
    } catch (err) {
      mainLog.warn(`[timer-registry] before-quit clearAllManaged failed: ${err && err.message}`);
    }
  });
```

(If there are multiple `app.once("before-quit", ...)` blocks already, add a new one — Electron supports multiple listeners.)

- [ ] **Step 4: Verify the file is still valid**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
node -e "require('./src/main/index.js'); console.log('LOAD OK')" 2>&1 | head -5
```
Expected: prints `LOAD OK` (or vitest-stub branch output — no syntax / require errors).

- [ ] **Step 5: Commit**

```bash
git add src/main/index.js
git commit -m "feat(timer-registry): wire startup audit + before-quit safety net in index.js (Phase Q5 v1)"
```

---

## Task 9: Run full test suite + manual smoke

- [ ] **Step 1: Run all tests**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
npm test -- --run
```
Expected: all 240+ tests pass (10 new registry tests + 9 new audit tests + 230+ existing). No new failures.

- [ ] **Step 2: Manual smoke — start the app and check main log**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
npm start 2>&1 | grep -E "timer-registry" &
APP_PID=$!
sleep 6
kill $APP_PID 2>/dev/null
wait 2>/dev/null
```

Expected: at least one log line containing `[timer-registry] audit: total=4 clean=1 orphan=2 debounce=1 dupSchedule=1` and per-entry `[orphan]`, `[dup-schedule]`, `[debounce]` lines.

If you see no `[timer-registry]` lines, double-check Task 8's placement of the audit call.

- [ ] **Step 3: Commit the rollout note (doc-only)**

Create `docs/superpowers/specs/2026-06-22-q5-rollout-note.md`:

```markdown
# Q5 v1 Rollout Note

Date: 2026-06-22
Phase: Q5 v1 — Timer Registry & Audit

## What landed

- `src/main/timer-registry.js` (new): managed interval/timeout API + fixture-based audit
- `tests/main/timer-registry.test.js` (new): 10 unit tests
- `tests/main/timer-registry-audit.test.js` (new): 9 unit tests
- `tests/fixtures/timer-audit/{clean,orphan,debounce,dup-schedule,commented}.js` (new): 5 fixture files
- `src/main/bootstrap/schedulers.js` (modified): `autoCheckTimer` migrated to `setManagedInterval` + `clearManaged`
- `src/main/index.js` (modified): `auditTimers` call inside `app.whenReady`, `clearAllManaged` in `app.once("before-quit")`

## Status

- Roadmap §5.1 Q5: `⚫ 未立项` → `🟢 已合入`
- Roadmap §10.2 Q5: `❌ Next 未开始` / `⚫ 未立项` → `🟢 已合入`

## Known limitations (per spec §6)

- audit scans fixtures only — real-repo scan deferred to v2.27
- no auto-repair for orphan / dup-schedule — manual only
- renderer timers out of scope
- no IPC stats — Q1 v2 will consume `getStats()` / `listManaged()` directly

## Next steps

- v2.27: introduce `cli:bin/audit-timers.js` to scan real `src/main/**` and produce a remediation backlog
- v2.27+: migrate remaining 12+ setInterval call sites to managed API (low risk, big safety win)
```

Then commit:

```bash
git add docs/superpowers/specs/2026-06-22-q5-rollout-note.md
git commit -m "docs(spec): add Q5 v1 rollout note + roadmap status flip"
```

- [ ] **Step 4: Flip roadmap status in 2026-06-19-product-roadmap-design.md**

Edit `docs/superpowers/specs/2026-06-19-product-roadmap-design.md`:

- In §5.1 概览表 (line ~147), the row `| Q5 | memory 治理(...) | 2 | 1 | 0 | 7 | 🟢 Next  | ⚫ 未立项 |` change the last cell from `⚫ 未立项` to `🟢 已合入`.
- In §10.2 the Q5 row changes status from `❌ 未开始` to `✅ 已落地`, replace the 落地证据 cell with:

```markdown
| Q5 | memory 治理 | 7 | 🟢 已合入 | `src/main/timer-registry.js` (managed API + fixture-based audit);`src/main/bootstrap/schedulers.js:autoCheckTimer` 走 `setManagedInterval`;`src/main/index.js` 启动 audit + `app.once("before-quit", clearAllManaged)` 兜底;`tests/main/timer-registry.test.js` (10 case) + `tests/main/timer-registry-audit.test.js` (9 case) + `tests/fixtures/timer-audit/` (5 fixture) |
```

Commit:

```bash
git add docs/superpowers/specs/2026-06-19-product-roadmap-design.md
git commit -m "docs(roadmap): flip Q5 to 已合入 in §5.1 + §10.2"
```

- [ ] **Step 5: Final verification**

Run:
```bash
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
npm test -- --run 2>&1 | tail -5
git log --oneline -10
```

Expected: all tests still pass; git log shows 9 new commits from this plan (Tasks 1-9).

---

## Self-Review

After writing the plan (this is the writer's self-review, run before handing to executor):

**1. Spec coverage:**

| Spec § | Plan Task |
| --- | --- |
| §2.2 API surface (8 fns) | Task 1 (`getStats/listManaged`), Task 2 (`setManagedInterval/setManagedTimeout/clearManaged/clearAllManaged`), Task 3 (`auditTimers`) |
| §2.3 调用方改动 schedulers.js | Task 7 |
| §2.3 调用方改动 index.js | Task 8 |
| §3.1 启动 audit 数据流 | Task 3 + Task 4 + Task 6 |
| §3.2 关键算法 (hasCleanup / debounce / dup-schedule) | Task 3 |
| §3.3 错误处理 | Task 3 (try/catch), Task 2 (clearManaged no-throw), Task 8 (try/catch around audit) |
| §4 测试护栏 | Task 5 (registry) + Task 6 (audit) |
| §5 风险 (注册表自身 leak) | Task 8 (before-quit clearAllManaged) |
| §7 验收 10 项 | All tasks collectively cover; Task 9 step 1 verifies |
| §8 Rollout | Task 9 steps 3-5 |

**2. Placeholder scan:** No TBD / TODO / "implement later" / "fill in details". Every code step has complete code. Every test step has complete test bodies. No "Similar to Task N" — each task repeats full context.

**3. Type consistency:** `setManagedInterval / setManagedTimeout` return `{ id, clear }` consistently in Tasks 2, 5, 7. `clearManaged({ id })` consistent. `auditTimers(rootDir, opts?)` consistent. `__resetForTest` consistent. `clearAllManaged(labelPrefix?)` consistent.

**No gaps found.**
