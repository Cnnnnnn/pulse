"use strict";

/**
 * src/main/movies/cache.ts
 *
 * 电影模块主进程 cache + 四级降级编排。
 *   L1 猫眼封装 → L2 猫眼直连 → L3 TMDB（可选 key）
 *   → 上次成功片单（磁盘/内存）→ L4 内置示例
 * refresh() 永远 resolve。示例数据不落盘，避免重启后把假片当成缓存。
 */

import * as fs from "fs";
import * as path from "path";
import { getMoviesSample } from "./sample";
import { fetchMaoyanLists as defaultFetchMaoyanLists } from "./fetcher-maoyan";
import { fetchTmdbLists as defaultFetchTmdbLists } from "./fetcher-tmdb";
import { SOURCE } from "./types";
import {
  MOVIES_CACHE_TTL_MS,
  getMovieCity,
  sanitizeMovieCityId,
} from "../../shared/movies-constants";

export const CACHE_TTL_MS = MOVIES_CACHE_TTL_MS;

export function createFilePersist(filePath?: string | null) {
  return {
    read(): { cityId?: number; payload?: any } | null {
      if (!filePath) return null;
      try {
        if (!fs.existsSync(filePath)) return null;
        const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return raw && typeof raw === "object" ? raw : null;
      } catch {
        return null;
      }
    },
    write(state: { cityId: number; payload: any | null }) {
      if (!filePath) return;
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(state));
      } catch {
        /* noop */
      }
    },
  };
}

function validPayload(p: any): boolean {
  return !!p && Array.isArray(p.nowPlaying) && Array.isArray(p.coming);
}

function isSampleSource(p: any): boolean {
  return !p || p.source === SOURCE.SAMPLE;
}

export function createMoviesCache({
  httpClient,
  tmdbApiKey,
  fetchMaoyanLists = defaultFetchMaoyanLists,
  fetchTmdbLists = defaultFetchTmdbLists,
  getMoviesSample: getSample = getMoviesSample,
  onUpdate,
  ttlMs = CACHE_TTL_MS,
  persist,
  cityId: initialCityId,
}: any = {}): any {
  let currentTmdbKey = typeof tmdbApiKey === "string" ? tmdbApiKey.trim() : "";
  const disk = persist && typeof persist.read === "function" ? persist.read() : null;
  let currentCity = sanitizeMovieCityId(
    initialCityId != null ? initialCityId : disk && disk.cityId,
  );
  let cache: any =
    disk && validPayload(disk.payload) && !isSampleSource(disk.payload)
      ? attachCity(disk.payload, currentCity)
      : null;
  let inflight: any = null;

  function attachCity(payload: any, cityId: number): any {
    const rest = { ...(payload || {}) };
    delete rest.degraded;
    return {
      ...rest,
      nowPlaying: [...(rest.nowPlaying || [])],
      coming: [...(rest.coming || [])],
      cityId,
    };
  }

  function snapshot(): any {
    if (!cache) return null;
    const s = attachCity(cache, currentCity);
    if (cache.degraded) s.degraded = true;
    return s;
  }

  function saveDisk() {
    if (!persist || typeof persist.write !== "function") return;
    const live = cache && !isSampleSource(cache) ? attachCity(cache, currentCity) : null;
    try {
      persist.write({ cityId: currentCity, payload: live });
    } catch {
      /* noop */
    }
  }

  function load(): any {
    return snapshot();
  }

  function getItem(movieId: string): any | null {
    const p = snapshot();
    if (!p || !movieId) return null;
    return (
      p.nowPlaying.find((m: any) => m && m.id === movieId) ||
      p.coming.find((m: any) => m && m.id === movieId) ||
      null
    );
  }

  async function refresh(opts: any = {}): Promise<any> {
    if (opts.cityId != null) {
      currentCity = sanitizeMovieCityId(opts.cityId);
    }
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const payload = await orchestrate();
        cache = attachCity(payload, currentCity);
        if (payload && payload.degraded) cache.degraded = true;
        saveDisk();
        if (typeof onUpdate === "function") {
          try {
            onUpdate(snapshot());
          } catch {
            /* noop */
          }
        }
        return snapshot();
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function orchestrate(): Promise<any> {
    const city = getMovieCity(currentCity);
    if (city && city.tmdbRegion) {
      if (currentTmdbKey) {
        try {
          const p = await fetchTmdbLists({
            httpClient,
            apiKey: currentTmdbKey,
            region: city.tmdbRegion,
            language: city.language || "zh-HK",
          });
          if (validPayload(p)) return p;
        } catch {
          /* fallthrough */
        }
      }
      return sameCityStale() || getSample();
    }

    try {
      const p = await fetchMaoyanLists({ httpClient, useDirect: false, cityId: currentCity });
      if (validPayload(p)) return p;
    } catch {
      /* fallthrough */
    }
    try {
      const p = await fetchMaoyanLists({ httpClient, useDirect: true, cityId: currentCity });
      if (validPayload(p)) return p;
    } catch {
      /* fallthrough */
    }
    if (currentTmdbKey) {
      try {
        const p = await fetchTmdbLists({
          httpClient,
          apiKey: currentTmdbKey,
          region: "CN",
          language: "zh-CN",
        });
        if (validPayload(p)) return p;
      } catch {
        /* fallthrough */
      }
    }
    return sameCityStale() || getSample();
  }

  function sameCityStale(): any | null {
    if (!cache || !validPayload(cache) || isSampleSource(cache)) return null;
    if (cache.cityId != null && cache.cityId !== currentCity) return null;
    return { ...attachCity(cache, currentCity), degraded: true };
  }

  function setTmdbApiKey(key: string) {
    currentTmdbKey = String(key || "").trim();
  }

  return { load, refresh, getItem, setTmdbApiKey, ttlMs, cityId: () => currentCity };
}

module.exports = { createMoviesCache, createFilePersist, CACHE_TTL_MS };
