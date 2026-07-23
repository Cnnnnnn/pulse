/**
 * src/main/ai-leaderboard/cache.ts
 *
 * 磁盘缓存（userData 下 ai-leaderboard-cache/）+ 进程内 Map TTL。
 * 离线可用、节流、单源失败回退 stale。
 *
 * - 主键命名：ai-lb:<source>:<board>:<YYYY-MM-DD>.json
 * - TTL：Arena/AA = 24h，OpenRouter = 6h（由 aggregator 传入）
 * - 过期但存在 → 仍返回（上层标 stale:true），避免全失败直接空白
 *
 * 在 vitest node 环境（无 electron）下自动降级为纯内存缓存，保证可测。
 */

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

let _cacheDir: string | false | null = null;
let _memCache = new Map<string, any>(); // key -> { data, fetchedAt }

/** 惰性解析缓存目录（首次调用时尝试读取 userData，失败则降级内存）。 */
export function getCacheDir(): string | false | null {
  if (_cacheDir !== null) return _cacheDir;
  try {
    const electron = require("electron");
    const app = electron && electron.app;
    const base = app && typeof app.getPath === "function" ? app.getPath("userData") : null;
    if (base) {
      _cacheDir = path.join(base, "ai-leaderboard-cache");
      try {
        fs.mkdirSync(_cacheDir as string, { recursive: true });
      } catch {
        _cacheDir = false;
      }
    } else {
      _cacheDir = false;
    }
  } catch {
    _cacheDir = false;
  }
  return _cacheDir;
}

/**
 * 构造缓存键。
 * @param source  'arena' | 'artificial-analysis' | 'openrouter'
 * @param board   对应 board / 数据集标识
 * @param date    YYYY-MM-DD（默认今天 UTC）
 * @returns {string}
 */
export function cacheKey(source: string, board: string, date?: string): string {
  const d = date || new Date().toISOString().slice(0, 10);
  return `ai-lb:${source}:${board}:${d}`;
}

/**
 * 读缓存。命中返回 { data, fetchedAt }，否则 null。
 * @param key
 * @returns {{data:unknown, fetchedAt:number}|null}
 */
export function readCache(key: string): { data: any; fetchedAt: number } | null {
  const mem = _memCache.get(key);
  if (mem) return mem;
  const dir = getCacheDir();
  if (!dir) return null;
  const fileGz = path.join(dir as string, `${encodeURIComponent(key)}.json.gz`);
  const filePlain = path.join(dir as string, `${encodeURIComponent(key)}.json`);
  try {
    let obj: any;
    if (fs.existsSync(fileGz)) {
      const compressed = fs.readFileSync(fileGz);
      const json = zlib.gunzipSync(compressed).toString("utf8");
      obj = JSON.parse(json);
      _memCache.set(key, obj);
      return obj;
    }
    if (fs.existsSync(filePlain)) {
      // ponytail: 旧格式 .json 兼容 — 一次性 lazy 升级到 .json.gz，下次启动走 .gz.
      obj = JSON.parse(fs.readFileSync(filePlain, "utf8"));
      _memCache.set(key, obj);
      try {
        const buf = zlib.gzipSync(Buffer.from(JSON.stringify(obj), "utf8"), { level: 6 });
        fs.writeFileSync(fileGz, buf);
        fs.unlinkSync(filePlain);
      } catch { /* 升级失败保留旧文件, 下次再试 */ }
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 写缓存。
 * @param key
 * @param data
 */
export function writeCache(key: string, data: any): void {
  const entry = { data, fetchedAt: Date.now() };
  _memCache.set(key, entry);
  const dir = getCacheDir();
  if (!dir) return;
  try {
    const file = path.join(dir as string, `${encodeURIComponent(key)}.json.gz`);
    const buf = zlib.gzipSync(Buffer.from(JSON.stringify(entry), "utf8"), { level: 6 });
    fs.writeFileSync(file, buf);
  } catch {
    /* 磁盘不可写忽略，内存缓存仍有效 */
  }
}

/**
 * 是否过期。
 * @param fetchedAt epoch ms
 * @param ttlMs
 * @returns {boolean}
 */
export function isStale(fetchedAt: number, ttlMs: number): boolean {
  return Date.now() - fetchedAt > ttlMs;
}

/** @internal — 测试用：清空内存缓存并复位缓存目录惰性标志。 */
export function __resetForTest() {
  _memCache = new Map();
  _cacheDir = null;
}

/** @internal — 测试用：注入缓存目录。truthy → 立即接管；falsy → 复位惰性标志。 */
export function __setCacheDirForTest(dir: any) {
  _cacheDir = dir ? String(dir) : null;
}

module.exports = {
  cacheKey,
  readCache,
  writeCache,
  isStale,
  getCacheDir,
  __resetForTest,
  __setCacheDirForTest,
};
