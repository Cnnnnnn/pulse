/**
 * src/main/ipc/register-football-value.ts
 *
 * 足球球员身价榜 — IPC 注册。
 *   football-value:get       → 聚合（命中缓存直接返回，不触网）
 *   football-value:refresh   → 强制重拉（force:true），回写缓存
 *
 * 渲染层只通过这几个通道交互（白名单）。单例 HttpClient 注入 fetcher。
 * 请求级缓存（Map + TTL 5min）照搬 register-leaderboard 同款范式，
 * 避免重复打 dcaribou R2（gz 文件较大，身价低频数据）。
 */
"use strict";

import type {} from "electron";

import { getFootballValueBoard } from "../football-value/index";
import { HttpClient } from "../http-client";

// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 请求级 5 分钟
const CACHE_MAX = 16;

/** @type {Map<string, {result:object, fetchedAt:number}>} */
const _cache = new Map();

export function cacheKey(): string {
  return "football-value:board"; // 仅一个榜单，无需区分参数
}

export function cacheGet(key: any) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.fetchedAt > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return e.result;
}

export function cacheSet(key: any, result: any) {
  if (_cache.size > CACHE_MAX) {
    const drop = [..._cache.keys()].slice(0, CACHE_MAX >> 1);
    for (const k of drop) _cache.delete(k);
  }
  _cache.set(key, { result, fetchedAt: Date.now() });
}

/** 测试 / 手动刷新用：清请求级缓存。 */
export function resetFootballValueCache() {
  _cache.clear();
}

/**
 * 白名单 sanitize：目前仅 force 字段。
 * @param payload
 * @returns {{force:boolean}}
 */
export function sanitize(payload: any) {
  const p = payload && typeof payload === "object" ? payload : {};
  return { force: Boolean(p.force) };
}

export function registerFootballValueHandlers(ctx: any) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  const httpClient = new HttpClient({ timeout: TIMEOUT_MS, maxRetries: 0 });

  async function handleGet(_event: any, payload: any) {
    const opts = sanitize(payload);
    const key = cacheKey();

    if (!opts.force) {
      const cached = cacheGet(key);
      if (cached) {
        return { ...cached, fromCache: true };
      }
    }

    try {
      const result = await getFootballValueBoard({
        httpClient,
        timeoutMs: TIMEOUT_MS,
        force: opts.force,
      });
      cacheSet(key, result);
      return opts.force ? { ...result, fromCache: false } : result;
    } catch (err: any) {
      return {
        ok: false,
        reason: "aggregate_failed",
        error: errMsg(err),
        players: [],
        count: 0,
        stale: false,
        fromCache: false,
        isSample: false,
        fetchedAt: new Date().toISOString(),
        errors: [errMsg(err)],
      };
    }
  }

  safeHandle("football-value:get", handleGet);

  // refresh：清 IPC 请求级缓存后重新走聚合；聚合层 3 天 TTL 节流仍生效
  // （缓存 ≤3 天 → 返回缓存不真拉；>3 天才真拉 dcaribou R2）。语义同 get，
  // 区别在于 refresh 绕过 IPC 5min 请求缓存，强制走一遍聚合判定。
  safeHandle("football-value:refresh", async (_event: any, payload: any) => {
    const opts = sanitize(payload);
    const key = cacheKey();
    _cache.delete(key); // 清 IPC 请求级缓存，让聚合重新判定 TTL
    try {
      // force 由用户显式 payload 控制（默认 false，尊重 3 天 TTL）；
      // 仅当用户传 force:true（如 UI "强制刷新" 长按）才绕过 TTL。
      const result = await getFootballValueBoard({
        httpClient,
        timeoutMs: TIMEOUT_MS,
        force: opts.force,
      });
      cacheSet(key, result);
      return { ...result, fromCache: false };
    } catch (err: any) {
      return {
        ok: false,
        reason: "aggregate_failed",
        error: errMsg(err),
        players: [],
        count: 0,
        stale: false,
        fromCache: false,
        isSample: false,
        fetchedAt: new Date().toISOString(),
        errors: [errMsg(err)],
      };
    }
  });
}

module.exports = {
  registerFootballValueHandlers,
  cacheKey,
  cacheGet,
  cacheSet,
  resetFootballValueCache,
  sanitize,
};
