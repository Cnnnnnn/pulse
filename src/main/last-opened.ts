/**
 * src/main/last-opened.ts
 *
 * Phase 29: 从 macOS 拿 app 的"最近打开时间".
 *
 * 数据源策略 (spec §4.1.2):
 *   1) mdls kMDItemLastUsedDate (Spotlight metadata, 高置信)
 *   2) stat -f '%a' (atime epoch sec, locale 无关, 估算)
 *   3) 都没有 → unknown
 *
 * 缓存:
 *   - in-memory Map<bundlePath, { ms, source, ts }>
 *   - TTL 5 min, 命中直接返, 不打 shell
 *   - main/index.js 在 check-on-launch 完成时后台 refresh
 *   - IPC get-last-opened 走 cache; refresh-last-opened 强制全刷
 *
 * 注入:
 *   - execFileImpl: 测试时 mock, 不用真 spawn
 *   - mdlsTimeout / statTimeout: 注入测试超时边界
 *
 * 不依赖: state-store / ipc — 这层是 29c (持久化 + IPC handler)
 */

import { execFile } from "child_process";

const DEFAULT_MDLS_TIMEOUT_MS = 2000;
const DEFAULT_STAT_TIMEOUT_MS = 1000;
export const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { ms: number | null; source: string; ts: number }>();

function cacheGet(bundlePath: string, now: number) {
  const entry = cache.get(bundlePath);
  if (!entry) return null;
  if (now - entry.ts > CACHE_TTL_MS) return null;
  return entry;
}

function cacheSet(bundlePath: string, ms: number | null, source: string, now: number) {
  cache.set(bundlePath, { ms, source, ts: now });
}

type ExecFileFn = (
  cmd: string,
  args: string[],
  opts: any,
  cb: (err: any, stdout: string) => void,
) => any;

export type GetLastOpenedOpts = {
  execFileImpl?: ExecFileFn;
  now?: number;
  mdlsTimeout?: number;
  statTimeout?: number;
  skipCache?: boolean;
};

export type LastOpenedResult = {
  ms: number | null;
  source: "spotlight" | "atime" | "unknown";
};

/**
 * @param bundlePath
 * @param opts
 */
export async function getLastOpened(
  bundlePath: string,
  opts: GetLastOpenedOpts = {},
): Promise<LastOpenedResult> {
  if (!bundlePath || typeof bundlePath !== "string") {
    return { ms: null, source: "unknown" };
  }
  const exec = opts.execFileImpl || execFile;
  const now = typeof opts.now === "number" ? opts.now : Date.now();
  const mdlsTimeout = opts.mdlsTimeout || DEFAULT_MDLS_TIMEOUT_MS;
  const statTimeout = opts.statTimeout || DEFAULT_STAT_TIMEOUT_MS;

  if (!opts.skipCache) {
    const cached = cacheGet(bundlePath, now);
    if (cached) return { ms: cached.ms, source: cached.source as LastOpenedResult["source"] };
  }

  // 1) mdls — Spotlight 索引的 → 准
  try {
    const ms = await runMdls(exec, bundlePath, mdlsTimeout);
    if (ms !== null) {
      cacheSet(bundlePath, ms, "spotlight", now);
      return { ms, source: "spotlight" };
    }
  } catch {
    /* mdls failed (timeout / no permission / not found) → fallback */
  }

  // 2) atime — bundle 文件本身的上次访问 (locale 无关, 用 stat)
  try {
    const ms = await runStatAtime(exec, bundlePath, statTimeout);
    if (ms !== null) {
      cacheSet(bundlePath, ms, "atime", now);
      return { ms, source: "atime" };
    }
  } catch {
    /* noop */
  }

  // 3) unknown — 都拿不到
  cacheSet(bundlePath, null, "unknown", now);
  return { ms: null, source: "unknown" };
}

function runMdls(exec: ExecFileFn, bundlePath: string, timeout: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: (val: any) => void, val: any) => {
      if (!settled) {
        settled = true;
        fn(val);
      }
    };
    const child = exec(
      "mdls",
      ["-name", "kMDItemLastUsedDate", bundlePath],
      { timeout },
      (err: any, stdout: string) => {
        if (err) return finish(reject, err);
        // stdout 形如 "kMDItemLastUsedDate = 2026-06-07 10:08:39 +0000"
        // 或 "kMDItemLastUsedDate = (null)" (未索引)
        const m = stdout.match(/=\s*(.+?)\s*$/m);
        if (!m) return finish(resolve, null);
        const val = m[1].trim();
        if (val === "(null)" || val === "") return finish(resolve, null);
        const ms = Date.parse(val);
        if (Number.isNaN(ms)) return finish(resolve, null);
        finish(resolve, ms);
      },
    );
    child.on("error", (e: any) => finish(reject, e));
  });
}

function runStatAtime(exec: ExecFileFn, bundlePath: string, timeout: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: (val: any) => void, val: any) => {
      if (!settled) {
        settled = true;
        fn(val);
      }
    };
    const child = exec(
      "stat",
      ["-f", "%a", bundlePath],
      { timeout },
      (err: any, stdout: string) => {
        if (err) return finish(reject, err);
        const sec = parseInt(stdout.trim(), 10);
        if (Number.isNaN(sec) || sec <= 0) return finish(resolve, null);
        finish(resolve, sec * 1000);
      },
    );
    child.on("error", (e: any) => finish(reject, e));
  });
}

/**
 * 全清缓存 (main 进程启动时调, 避免老 cache 残留)
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * 强制 refresh 一个 path (不读 cache, 调完更新 cache)
 * IPC refresh-last-opened 用
 */
export function refreshOne(bundlePath: string, opts?: GetLastOpenedOpts): Promise<LastOpenedResult> {
  return getLastOpened(bundlePath, { ...opts, skipCache: true });
}

module.exports = {
  getLastOpened,
  refreshOne,
  clearCache,
  DEFAULT_MDLS_TIMEOUT_MS,
  DEFAULT_STAT_TIMEOUT_MS,
  CACHE_TTL_MS,
  // test-only
  _cache: cache,
  _runMdls: runMdls,
  _runStatAtime: runStatAtime,
};