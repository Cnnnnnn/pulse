"use strict";

/**
 * src/main/movies/cache.ts
 *
 * 电影模块主进程 cache + 四级降级编排（P0 核心）.
 *   L1 猫眼封装 (maoyan-netstart) → L2 猫眼直连 (maoyan-direct)
 *      → L3 TMDB region=CN (tmdb, 可选 key) → L4 内置示例 (sample)
 * 任一上层成功即返回；全部失败落到 L4（永远不空白）.
 * refresh() 永远 resolve（最坏 = 示例），不在主链路抛硬失败给渲染层.
 */

import { getMoviesSample } from "./sample";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30min

export function createMoviesCache({
  httpClient,
  tmdbApiKey,
  fetchMaoyanLists,
  fetchTmdbLists,
  getMoviesSample: getSample = getMoviesSample,
  onUpdate,
  ttlMs = CACHE_TTL_MS,
}: any = {}): any {
  let cache: any = null;
  let inflight: any = null;

  function load(): any {
    return cache ? { ...cache, nowPlaying: [...cache.nowPlaying], coming: [...cache.coming] } : null;
  }

  async function refresh(): Promise<any> {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const payload = await orchestrate();
        cache = {
          ...payload,
          nowPlaying: [...payload.nowPlaying],
          coming: [...payload.coming],
        };
        if (typeof onUpdate === "function") {
          try {
            onUpdate(cache);
          } catch {
            /* noop */
          }
        }
        return cache;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  /** 按 L1→L2→L3→L4 顺序尝试，返回第一个成功的 payload */
  async function orchestrate(): Promise<any> {
    // L1 猫眼封装
    try {
      const p = await fetchMaoyanLists({ httpClient, useDirect: false });
      if (validPayload(p)) return p;
    } catch {
      /* fallthrough */
    }
    // L2 猫眼直连
    try {
      const p = await fetchMaoyanLists({ httpClient, useDirect: true });
      if (validPayload(p)) return p;
    } catch {
      /* fallthrough */
    }
    // L3 TMDB（仅当提供了 key）
    if (tmdbApiKey && typeof tmdbApiKey === "string" && tmdbApiKey.trim()) {
      try {
        const p = await fetchTmdbLists({ httpClient, apiKey: tmdbApiKey });
        if (validPayload(p)) return p;
      } catch {
        /* fallthrough */
      }
    }
    // L4 内置示例（兜底，永不空白）
    return getSample();
  }

  function validPayload(p: any): boolean {
    return !!p && Array.isArray(p.nowPlaying) && Array.isArray(p.coming);
  }

  return { load, refresh, ttlMs };
}

module.exports = { createMoviesCache, CACHE_TTL_MS };
