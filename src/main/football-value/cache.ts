/**
 * src/main/football-value/cache.ts
 *
 * 磁盘缓存（userData/football-value-cache/）+ 进程内 Map TTL。
 * - 主键命名：football-value:top:v2.json（稳定 key，3 天 TTL 节流手动刷新）
 * - 低频数据（身价 Transfermarkt 季度级更新），TTL = 3 天；过期标 stale 由 UI 决定
 * - 涨跌基线（prevValueEur）已弃用：涨跌列改为"采集时间"语义
 *
 * 在 vitest node 环境（无 electron）下自动降级为纯内存缓存，保证可测。
 */
"use strict";

import * as fs from "fs";
import * as path from "path";

let _cacheDir: string | false | null = null;
let _memCache = new Map<string, any>(); // key -> { data, fetchedAt }

/** 惰性解析缓存目录（首次调用时尝试读取 userData，失败则降级内存）。 */
export function getCacheDir(): string | false | null {
  if (_cacheDir !== null) return _cacheDir;
  try {
    const electron = require("electron");
    const app = electron && electron.app;
    const base =
      app && typeof app.getPath === "function" ? app.getPath("userData") : null;
    if (base) {
      _cacheDir = path.join(base, "football-value-cache");
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
 * 稳定 key（不带日期）—— 3 天 TTL 节流手动刷新，跨日复用同一份缓存。
 * （历史上带日期 v2:<YYYY-MM-DD>，但跨日自动 miss 与"手动 only + 3 天 TTL"
 *  策略冲突，改为稳定 key；涨跌基线已弃用，不再需要扫日期 key 找上次快照。）
 * @param board "top"（目前仅一个榜单）
 * @param date 兼容旧签名（忽略）
 * @returns {string}
 */
export function cacheKey(board: string, date?: string): string {
  return `football-value:${board}:v2`;
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
  const file = path.join(dir as string, `${encodeURIComponent(key)}.json`);
  try {
    if (!fs.existsSync(file)) return null;
    const obj = JSON.parse(fs.readFileSync(file, "utf8"));
    _memCache.set(key, obj);
    return obj;
  } catch {
    return null;
  }
}

/**
 * 找同 board 最新一份磁盘缓存（stale 回退兜底）。
 * 注：稳定 key 改造后，同 board 只有一份缓存条目（v2，无日期）。
 * 涨跌基线（prevValueEur）已随"涨跌列改采集时间语义"弃用，本函数仅保留给
 * getBoard 的"今日 key miss → 回退最近一份"兜底路径用。参数为兼容旧签名保留。
 * @param board
 * @param excludeDate 兼容旧签名（忽略）
 * @returns {{data:any, fetchedAt:number}|null}
 */
export function readLatestCache(
  board: string,
  excludeDate?: string,
): { data: any; fetchedAt: number } | null {
  // 稳定 key：直接读唯一条目
  return readCache(cacheKey(board));
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
    const file = path.join(dir as string, `${encodeURIComponent(key)}.json`);
    fs.writeFileSync(file, JSON.stringify(entry), "utf8");
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
  readLatestCache,
  writeCache,
  isStale,
  getCacheDir,
  __resetForTest,
  __setCacheDirForTest,
};
