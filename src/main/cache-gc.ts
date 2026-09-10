/**
 * src/main/cache-gc.ts
 *
 * 启动期 userData 缓存统一 GC。
 *
 * 范围（只动可再生缓存，不动用户数据）：
 *   - Chromium Cache / Service Worker / Code Cache  — 按 mtime 超龄删
 *   - football-value-cache                          — v2.80 世界杯下线残留，整目录删
 *   - ai-leaderboard-cache 超龄 .json/.json.gz      — 兜底（scheduler 已有 30 天 prune）
 *
 * 明确不动：
 *   - state.json / vault/ / ai-keys/ / config.json / versions/
 *   - finance_news.json / finance_quotes.json / finance_ai.json（业务侧已有条数上限）
 *   - userData 根下的日志目录（error-aggregator 自己 cleanup）
 */

import type * as fsType from "node:fs";
import type * as pathType from "node:path";

const fs: typeof fsType = require("node:fs");
const path: typeof pathType = require("node:path");

/** Chromium 缓存文件保留天数 */
export const CHROMIUM_CACHE_MAX_AGE_DAYS = 14;
/** Chromium 缓存总大小上限（mtime 之外的硬顶，防高频浏览把 Cache 撑到百 MB） */
export const CHROMIUM_CACHE_MAX_BYTES = 80 * 1024 * 1024;
/** ai-leaderboard 缓存文件保留天数（与 scheduler pruneOldCache 对齐，这里做兜底） */
export const LEADERBOARD_CACHE_MAX_AGE_DAYS = 30;
/** 已下线模块残留目录（相对 userData） */
export const DEAD_DIRS = ["football-value-cache"];

type GcLogger = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
};

export type CacheGcResult = {
  removedFiles: number;
  removedDirs: number;
  freedBytes: number;
  skipped: string[];
};

function dirSize(dir: string): number {
  let total = 0;
  let entries: fsType.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    try {
      if (e.isDirectory()) total += dirSize(fp);
      else if (e.isFile()) total += fs.statSync(fp).size;
    } catch {
      /* race / permission — skip */
    }
  }
  return total;
}

function rmrf(dir: string): number {
  const size = dirSize(dir);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return size;
  } catch {
    return 0;
  }
}

/**
 * 递归删除 dir 下 mtime 早于 cutoff 的文件；保留空目录结构。
 * @returns {removed, freed}
 */
function pruneByMtime(dir: string, cutoffMs: number): { removed: number; freed: number } {
  let removed = 0;
  let freed = 0;
  let entries: fsType.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { removed, freed };
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    try {
      if (e.isDirectory()) {
        const sub = pruneByMtime(fp, cutoffMs);
        removed += sub.removed;
        freed += sub.freed;
        // 空目录可删
        try {
          if (fs.readdirSync(fp).length === 0) fs.rmdirSync(fp);
        } catch {
          /* noop */
        }
      } else if (e.isFile()) {
        const st = fs.statSync(fp);
        if (st.mtimeMs < cutoffMs) {
          freed += st.size;
          fs.unlinkSync(fp);
          removed += 1;
        }
      }
    } catch {
      /* race — skip */
    }
  }
  return { removed, freed };
}

type FileStat = { path: string; size: number; mtimeMs: number };

function listFilesRecursive(dir: string, out: FileStat[] = []): FileStat[] {
  let entries: fsType.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    try {
      if (e.isDirectory()) listFilesRecursive(fp, out);
      else if (e.isFile()) {
        const st = fs.statSync(fp);
        out.push({ path: fp, size: st.size, mtimeMs: st.mtimeMs });
      }
    } catch {
      /* race — skip */
    }
  }
  return out;
}

/**
 * 目录总大小超过 maxBytes 时，按 mtime 从旧到新删，直到 ≤ maxBytes。
 * 用于 Chromium Cache：mtime 窗口内的高频访问仍可能把体积撑爆。
 */
function enforceSizeCap(
  dir: string,
  maxBytes: number,
): { removed: number; freed: number } {
  let files: FileStat[];
  try {
    files = listFilesRecursive(dir);
  } catch {
    return { removed: 0, freed: 0 };
  }
  let total = files.reduce((s, f) => s + f.size, 0);
  if (total <= maxBytes) return { removed: 0, freed: 0 };
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  let removed = 0;
  let freed = 0;
  for (const f of files) {
    if (total <= maxBytes) break;
    try {
      fs.unlinkSync(f.path);
      total -= f.size;
      freed += f.size;
      removed += 1;
    } catch {
      /* race — skip */
    }
  }
  return { removed, freed };
}

/**
 * @param opts.userData  Electron app.getPath('userData')
 * @param opts.now       测试注入时间
 * @param opts.logger    mainLog
 * @param opts.chromiumMaxBytes  覆盖默认 Chromium 缓存总大小上限（测试用）
 */
export function runCacheGc(opts: {
  userData: string;
  now?: number | Date;
  logger?: GcLogger;
  chromiumMaxBytes?: number;
}): CacheGcResult {
  const userData = opts.userData;
  const nowMs = opts.now instanceof Date ? opts.now.getTime() : (opts.now || Date.now());
  const log = opts.logger;
  const chromiumMaxBytes =
    typeof opts.chromiumMaxBytes === "number"
      ? opts.chromiumMaxBytes
      : CHROMIUM_CACHE_MAX_BYTES;
  const result: CacheGcResult = {
    removedFiles: 0,
    removedDirs: 0,
    freedBytes: 0,
    skipped: [],
  };
  if (!userData || !fs.existsSync(userData)) {
    result.skipped.push("userData_missing");
    return result;
  }

  // 1) Chromium 缓存：先 mtime 超龄删，再总大小硬顶（按 mtime 从旧到新）
  const chromiumDirs = ["Cache", "Service Worker", "Code Cache", "GPUCache"];
  const chromiumCutoff = nowMs - CHROMIUM_CACHE_MAX_AGE_DAYS * 86400_000;
  for (const name of chromiumDirs) {
    const dir = path.join(userData, name);
    if (!fs.existsSync(dir)) continue;
    const r = pruneByMtime(dir, chromiumCutoff);
    result.removedFiles += r.removed;
    result.freedBytes += r.freed;
    const cap = enforceSizeCap(dir, chromiumMaxBytes);
    result.removedFiles += cap.removed;
    result.freedBytes += cap.freed;
  }

  // 2) 死目录
  for (const name of DEAD_DIRS) {
    const dir = path.join(userData, name);
    if (!fs.existsSync(dir)) continue;
    const freed = rmrf(dir);
    if (freed > 0 || !fs.existsSync(dir)) {
      result.removedDirs += 1;
      result.freedBytes += freed;
    }
  }

  // 3) ai-leaderboard-cache 兜底 prune
  const lbDir = path.join(userData, "ai-leaderboard-cache");
  if (fs.existsSync(lbDir)) {
    const lbCutoff = nowMs - LEADERBOARD_CACHE_MAX_AGE_DAYS * 86400_000;
    const r = pruneByMtime(lbDir, lbCutoff);
    result.removedFiles += r.removed;
    result.freedBytes += r.freed;
  }

  if (log) {
    log.info("[cache-gc] done", {
      removedFiles: result.removedFiles,
      removedDirs: result.removedDirs,
      freedMB: Math.round((result.freedBytes / (1024 * 1024)) * 10) / 10,
    });
  }
  return result;
}

/**
 * 启动后延迟跑一次（默认 30s，避开冷启动关键路径）。
 */
export function scheduleCacheGc(opts: {
  userData: string;
  delayMs?: number;
  logger?: GcLogger;
}): () => void {
  const delay = typeof opts.delayMs === "number" ? opts.delayMs : 30_000;
  const timer = setTimeout(() => {
    try {
      runCacheGc({ userData: opts.userData, logger: opts.logger });
    } catch (err: any) {
      opts.logger?.warn("[cache-gc] failed", {
        msg: err && err.message,
      });
    }
  }, delay);
  if (typeof (timer as any).unref === "function") (timer as any).unref();
  return () => clearTimeout(timer);
}

export { dirSize as _dirSize, pruneByMtime as _pruneByMtime, enforceSizeCap as _enforceSizeCap };
