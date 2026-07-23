/**
 * src/main/timer-registry.ts
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

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type * as timersType from "node:timers";
import type * as fsType from "node:fs";
import type * as pathType from "node:path";

const timers: typeof timersType = require("node:timers");
const fs: typeof fsType = require("node:fs");
const path: typeof pathType = require("node:path");

type ManagedHandle = import("../shared/electron/timer-registry-adapter").ManagedHandle;
type ManagedTimerMeta = import("../shared/electron/timer-registry-adapter").ManagedTimerMeta;
type ManagedStats = import("../shared/electron/timer-registry-adapter").ManagedStats;
type ManagedEntrySnapshot = import("../shared/electron/timer-registry-adapter").ManagedEntrySnapshot;
type AuditSummary = import("../shared/electron/timer-registry-adapter").AuditSummary;
type AuditLogger = import("../shared/electron/timer-registry-adapter").AuditLogger;
type AuditOptions = import("../shared/electron/timer-registry-adapter").AuditOptions;
type AuditEntry = import("../shared/electron/timer-registry-adapter").AuditEntry;
type AuditKind = import("../shared/electron/timer-registry-adapter").AuditKind;

interface RegistryEntry {
  id: number;
  type: "interval" | "timeout";
  label: string;
  file: string | null;
  line: number | null;
  startedAt: number;
  handle: NodeJS.Timeout;
}

const _entries: RegistryEntry[] = [];

let _nextId = 1;

/**
 * @param fn
 * @param ms
 * @param meta
 */
function setManagedInterval(
  fn: () => void,
  ms: number,
  meta?: ManagedTimerMeta,
): ManagedHandle {
  const id = _nextId++;
  const native = timers.setInterval(fn, ms);
  const entry: RegistryEntry = {
    id,
    type: "interval",
    label: (meta && meta.label) || "anon",
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
 * @param fn
 * @param ms
 * @param meta
 */
function setManagedTimeout(
  fn: () => void,
  ms: number,
  meta?: ManagedTimerMeta,
): ManagedHandle {
  const id = _nextId++;
  const native = timers.setTimeout(fn, ms);
  const entry: RegistryEntry = {
    id,
    type: "timeout",
    label: (meta && meta.label) || "anon",
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
 * @param handleOrId
 * @returns true if a live entry was cleared
 */
function clearManaged(
  handleOrId: ManagedHandle | { id: number },
): boolean {
  if (!handleOrId || typeof handleOrId.id !== "number") return false;
  const idx = _entries.findIndex((e) => e.id === handleOrId.id);
  if (idx < 0) return false;
  const entry = _entries[idx];
  try {
    if (entry.type === "interval") timers.clearInterval(entry.handle);
    else timers.clearTimeout(entry.handle);
  } catch {
    /* swallow — stale native handle should never throw to caller */
  }
  _entries.splice(idx, 1);
  return true;
}

/**
 * @param labelPrefix — when provided, only clear entries whose
 *   label starts with this string. When undefined, clears ALL managed timers.
 */
function clearAllManaged(labelPrefix?: string): number {
  const targets =
    typeof labelPrefix === "string"
      ? _entries.filter((entry) => entry.label.startsWith(labelPrefix))
      : _entries.slice();
  for (const entry of targets) clearManaged(entry);
  return targets.length;
}

/**
 * @returns {{count:number,byType:{interval:number,timeout:number}}}
 */
function getStats(): ManagedStats {
  const byType = { interval: 0, timeout: 0 };
  for (const e of _entries) byType[e.type] += 1;
  return { count: _entries.length, byType };
}

/**
 * @returns {Array<{id:number,type:'interval'|'timeout',label:string,file:string|null,line:number|null,startedAt:number}>}
 */
function listManaged(): ManagedEntrySnapshot[] {
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
function __resetForTest(): void {
  clearAllManaged();
  _nextId = 1;
}

/**
 * Scan one file's lines, collecting all setInterval / setTimeout call sites.
 * Skips comment-only lines and 1-shot microtask timeouts (setTimeout ms < 5).
 */
interface TimerSite {
  file: string;
  line: number;
  code: string;
  var: string | null;
  ms: number | null;
  func: string;
}

function collectTimerSites(lines: string[], file: string): TimerSite[] {
  const sites: TimerSite[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*")) continue; // comments

    const m = line.match(/(setInterval|setTimeout)\s*\(/);
    if (!m) continue;
    // ignore 1-shot microtask timeouts (ms arg of 0/1/<5)
    const msMatch = line.match(/,\s*(\d+)\s*\)/);
    const ms = msMatch ? Number(msMatch[1]) : null;
    if (m[1] === "setTimeout" && ms !== null && ms < 5) continue;

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
  return sites;
}

/**
 * Walk up to 50 lines ahead of `site` looking for clearInterval(var) /
 * clearTimeout(var). Returns true if a cleanup call is found.
 */
function siteHasCleanup(site: TimerSite, lines: string[]): boolean {
  if (!site.var) return false;
  const searchLimit = Math.min(lines.length, site.line + 50);
  for (let j = site.line; j < searchLimit; j++) {
    const look = lines[j];
    if (
      (look.includes(`clearInterval(${site.var})`) ||
        look.includes(`clearTimeout(${site.var})`)) &&
      !look.trim().startsWith("//")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Decide the kind of a timer site given its cleanup status + sibling sites.
 *   clean         → has a clearInterval/clearTimeout nearby
 *   debounce      → setTimeout: same var assigned >= 2 times
 *   dup-schedule  → setInterval: same var assigned >= 2 times without clear
 *   orphan        → everything else (incl. anonymous)
 */
function classifySite(
  site: TimerSite,
  hasCleanup: boolean,
  sites: TimerSite[],
): AuditKind {
  if (hasCleanup) return "clean";
  if (site.func === "setTimeout" && site.var) {
    const sameVarCount = sites.filter(
      (s) => s.var === site.var && s.func === "setTimeout",
    ).length;
    return sameVarCount >= 2 ? "debounce" : "orphan";
  }
  if (site.func === "setInterval" && site.var) {
    const sameVarCount = sites.filter(
      (s) => s.var === site.var && s.func === "setInterval",
    ).length;
    return sameVarCount >= 2 ? "dup-schedule" : "orphan";
  }
  return "orphan"; // anonymous (no var)
}

/**
 * Emit a per-site log line for non-clean kinds. Clean sites are silent.
 */
function logSiteKind(
  kind: AuditKind,
  site: TimerSite,
  file: string,
  logger: AuditLogger | null,
): void {
  if (!logger) return;
  const msSuffix = site.ms != null ? `${site.ms}ms ` : "";
  if (kind === "orphan") {
    logger.info(
      `[timer-registry] [orphan] ${file}:${site.line} ${site.func} ${msSuffix}(no clear found in 50 lines)`,
    );
  } else if (kind === "dup-schedule") {
    logger.info(
      `[timer-registry] [dup-schedule] ${file}:${site.line} ${site.func} ${msSuffix}(var ${site.var} reassigned without prior clear)`,
    );
  } else if (kind === "debounce") {
    logger.info(
      `[timer-registry] [debounce] ${file}:${site.line} ${site.func} ${msSuffix}`,
    );
  }
}

/**
 * Scan .js files under rootDir for setInterval / setTimeout usage and
 * classify each as clean / orphan / debounce / dup-schedule.
 *
 * Pure CommonJS, no mainLog dependency — caller (src/main/index.js)
 * is responsible for writing the summary to mainLog if it wants.
 */
function auditTimers(
  rootDir: string,
  opts?: AuditOptions,
): AuditSummary {
  const logger = (opts && opts.logger) || null;
  const summary: AuditSummary = {
    total: 0,
    clean: 0,
    orphan: 0,
    debounce: 0,
    dupSchedule: 0,
    entries: [],
    skipped: [],
  };
  if (!rootDir || typeof rootDir !== "string") return summary;

  let files: string[];
  try {
    files = fs.readdirSync(rootDir).filter((f) => f.endsWith(".js"));
  } catch (err) {
    if (logger) logger.warn(`[timer-registry] audit: readdir failed: ${err && err.message}`);
    return summary;
  }

  for (const file of files) {
    const full = path.join(rootDir, file);
    let content: string;
    try {
      content = fs.readFileSync(full, "utf8");
    } catch (err) {
      summary.skipped.push(file);
      if (logger) logger.warn(`[timer-registry] audit: skip ${file}: ${err && err.message}`);
      continue;
    }
    const lines = content.split("\n");
    const sites = collectTimerSites(lines, file);

    for (const site of sites) {
      const hasCleanup = siteHasCleanup(site, lines);
      const kind = classifySite(site, hasCleanup, sites);

      const entry: AuditEntry = {
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
      if (kind === "clean") summary.clean += 1;
      else if (kind === "orphan") summary.orphan += 1;
      else if (kind === "debounce") summary.debounce += 1;
      else if (kind === "dup-schedule") summary.dupSchedule += 1;

      logSiteKind(kind, site, file, logger);
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