/**
 * src/main/ai-leaderboard/rate-limiter.ts
 *
 * 限流层：
 *   - AA 令牌桶：1000/天（按 UTC 日重置），计数持久化到缓存目录（重启不丢，
 *     避免反复重启静默超掉 AA Free 每日配额 → 401/429）
 *   - 通用单飞（single-flight）：避免同 source 并发重复打外部 API
 *
 * 纯函数 + 模块级状态，便于单测（resetLimiter 可清状态）。
 */
"use strict";

import * as fs from "fs";
import * as path from "path";
import { getCacheDir } from "./cache";

export const AA_DAILY_LIMIT = 1000;
const AA_RATE_FILE = "aa-rate.json";

let _aaUsed = 0;
let _aaDay = _utcDay();
let _aaLastAcquireAt: string | null = null;
let _persistLoaded = false;
const _inflight = new Map<string, Promise<any>>(); // source -> Promise（单飞）

function _utcDay(d?: Date): string {
  const date = d || new Date();
  return date.toISOString().slice(0, 10);
}

/** 启动后首次使用时，从缓存目录恢复当日已用计数（跨日/损坏/无磁盘则忽略）。 */
function _loadPersisted() {
  if (_persistLoaded) return;
  _persistLoaded = true;
  try {
    const dir = getCacheDir();
    if (!dir) return;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, AA_RATE_FILE), "utf8"));
    if (raw && raw.day === _utcDay() && Number.isFinite(raw.used)) {
      _aaUsed = Math.max(0, Math.floor(raw.used));
    }
  } catch {
    /* 无文件 / 损坏 / 非 Electron 环境（测试）— 匿名从 0 起 */
  }
}

/** best-effort 落盘当日计数；无磁盘目录（测试/异常）静默跳过。 */
function _persistState() {
  try {
    const dir = getCacheDir();
    if (!dir) return;
    fs.writeFileSync(
      path.join(dir, AA_RATE_FILE),
      JSON.stringify({ day: _aaDay, used: _aaUsed }),
    );
  } catch {
    /* ignore */
  }
}

function _resetIfNewDay() {
  const today = _utcDay();
  if (today !== _aaDay) {
    _aaDay = today;
    _aaUsed = 0;
    _aaLastAcquireAt = null;
  }
}

function _nextUtcMidnight(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)).toISOString();
}

/**
 * 令牌桶获取（AA 1000/天）。
 * @param source 'artificial-analysis' | 其它
 * @returns {boolean} true=放行
 */
export function acquire(source: string): boolean {
  if (source === "artificial-analysis") {
    _loadPersisted();
    _resetIfNewDay();
    if (_aaUsed >= AA_DAILY_LIMIT) return false;
    _aaUsed += 1;
    _aaLastAcquireAt = new Date().toISOString();
    _persistState();
    return true;
  }
  return true;
}

/**
 * 剩余令牌。
 * @param source
 * @returns {number} Infinity 表示不限
 */
export function remaining(source: string): number {
  if (source === "artificial-analysis") {
    _loadPersisted();
    _resetIfNewDay();
    return Math.max(0, AA_DAILY_LIMIT - _aaUsed);
  }
  return Infinity;
}

export function budget(source: string): any {
  if (source !== "artificial-analysis") {
    return {
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      dayResetsAt: null,
      lastAcquireAt: null,
    };
  }

  _loadPersisted();
  _resetIfNewDay();
  return {
    used: _aaUsed,
    limit: AA_DAILY_LIMIT,
    remaining: Math.max(0, AA_DAILY_LIMIT - _aaUsed),
    dayResetsAt: _nextUtcMidnight(),
    lastAcquireAt: _aaLastAcquireAt,
  };
}

/**
 * 单飞包装：同一 source 并发只跑一次底层 fn。
 * @param source
 * @param fn
 * @returns {Promise<any>}
 */
async function singleFlight<T = any>(source: string, fn: () => Promise<T>): Promise<T> {
  const existing = _inflight.get(source);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      return await fn();
    } finally {
      _inflight.delete(source);
    }
  })();
  _inflight.set(source, p);
  return p;
}

/** 测试用：清状态（含持久化恢复标志与去重表）。 */
export function resetLimiter() {
  _aaUsed = 0;
  _aaDay = _utcDay();
  _aaLastAcquireAt = null;
  _persistLoaded = true; // 测试内不回读磁盘，保持确定性
  _inflight.clear();
}

/** @internal — 测试用：模拟进程重启，从磁盘恢复计数（需先 __setCacheDirForTest 指向 tmp）。 */
export function __reloadForTest() {
  _aaUsed = 0;
  _aaDay = _utcDay();
  _aaLastAcquireAt = null;
  _persistLoaded = false;
  _loadPersisted();
}

module.exports = {
  AA_DAILY_LIMIT,
  acquire,
  remaining,
  budget,

  resetLimiter,
  __reloadForTest,
};
