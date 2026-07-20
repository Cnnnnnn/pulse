/**
 * src/main/ai-leaderboard/cache.js
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
const path = require("path");

let _cacheDir = null;
let _memCache = new Map(); // key -> { data, fetchedAt }

/** 惰性解析缓存目录（首次调用时尝试读取 userData，失败则降级内存）。 */
function getCacheDir() {
  if (_cacheDir !== null) return _cacheDir;
  try {
     
    const electron = require("electron");
    const app = electron && electron.app;
    const base = app && typeof app.getPath === "function" ? app.getPath("userData") : null;
    if (base) {
      _cacheDir = path.join(base, "ai-leaderboard-cache");
      try {
        fs.mkdirSync(_cacheDir, { recursive: true });
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
 * @param {string} source  'arena' | 'artificial-analysis' | 'openrouter'
 * @param {string} board   对应 board / 数据集标识
 * @param {string} date    YYYY-MM-DD（默认今天 UTC）
 * @returns {string}
 */
function cacheKey(source, board, date) {
  const d = date || new Date().toISOString().slice(0, 10);
  return `ai-lb:${source}:${board}:${d}`;
}

/**
 * 读缓存。命中返回 { data, fetchedAt }，否则 null。
 * @param {string} key
 * @returns {{data:unknown, fetchedAt:number}|null}
 */
function readCache(key) {
  const mem = _memCache.get(key);
  if (mem) return mem;
  const dir = getCacheDir();
  if (!dir) return null;
  try {
    const file = path.join(dir, `${encodeURIComponent(key)}.json`);
    if (!fs.existsSync(file)) return null;
    const obj = JSON.parse(fs.readFileSync(file, "utf8"));
    _memCache.set(key, obj);
    return obj;
  } catch {
    return null;
  }
}

/**
 * 写缓存。
 * @param {string} key
 * @param {unknown} data
 */
function writeCache(key, data) {
  const entry = { data, fetchedAt: Date.now() };
  _memCache.set(key, entry);
  const dir = getCacheDir();
  if (!dir) return;
  try {
    const file = path.join(dir, `${encodeURIComponent(key)}.json`);
    fs.writeFileSync(file, JSON.stringify(entry), "utf8");
  } catch {
    /* 磁盘不可写忽略，内存缓存仍有效 */
  }
}

/**
 * 是否过期。
 * @param {number} fetchedAt epoch ms
 * @param {number} ttlMs
 * @returns {boolean}
 */
function isStale(fetchedAt, ttlMs) {
  return Date.now() - fetchedAt > ttlMs;
}

/** @internal — 测试用：清空内存缓存并复位缓存目录惰性标志。 */
function __resetForTest() {
  _memCache = new Map();
  _cacheDir = null;
}

module.exports = {
  cacheKey,
  readCache,
  writeCache,
  isStale,
  getCacheDir,
  __resetForTest,
};
