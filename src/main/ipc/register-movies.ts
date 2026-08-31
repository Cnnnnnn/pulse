/**
 * src/main/ipc/register-movies.ts
 *
 * 电影模块唯一 electron 边界. 通过 ctx.safeHandle 注册 3 个 channel:
 *   movies:load      返 cache（内存，未命中则磁盘）
 *   movies:refresh   L1→L2→L3→上次成功片单→L4 示例；可选 cityId
 *   movies:detail    猫眼详情；TMDB 片走 movie/{id}+credits+videos；示例回退列表字段
 */

import type {} from "electron";
import type { IpcChannelMap, MoviesPayload, MovieItem } from "../../shared/ipc-contracts";
import * as path from "path";
import { fetchMaoyanDetail, fetchMaoyanLists, fetchMaoyanCinemas, fetchMaoyanCinemaShows, fetchMaoyanCinemaFilters } from "../movies/fetcher-maoyan";
import { fetchTmdbLists, fetchTmdbDetail } from "../movies/fetcher-tmdb";
import { createMoviesCache, createFilePersist } from "../movies/cache";
import { SOURCE, shouldFetchMaoyanDetail } from "../movies/types";
import { loadTmdbApiKey, saveTmdbApiKey, getTmdbApiKeySource } from "../movies/tmdb-env";
import { getMovieCity, supportsMaoyanShowtimes } from "../../shared/movies-constants";
import { HttpClient } from "../http-client";
import { mainLog } from "../log";
import { listMovieWatchlist, setMovieWatchlistReminder, toggleMovieWatchlist } from "../movies/watchlist";
import * as reminders from "../reminders";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function moviesCacheFile(): string | null {
  try {
    const electron = require("electron");
    const app = electron && electron.app;
    const base = app && typeof app.getPath === "function" ? app.getPath("userData") : null;
    return base ? path.join(base, "movies-cache.json") : null;
  } catch {
    return null;
  }
}

export const UPDATED_CHANNEL = "movies:updated";
const TIMEOUT_MS = 10000;

export function registerMoviesHandlers(ctx: any) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  const httpClient = new HttpClient({ timeout: TIMEOUT_MS, maxRetries: 0 });

  const cache = createMoviesCache({
    httpClient,
    tmdbApiKey: loadTmdbApiKey(),
    fetchMaoyanLists,
    fetchTmdbLists,
    persist: createFilePersist(moviesCacheFile()),
    onUpdate: (payload: IpcChannelMap["movies:load"]["result"]) => {
      if (typeof sendToRenderer === "function") {
        try {
          sendToRenderer(UPDATED_CHANNEL, payload);
        } catch {
          /* noop */
        }
      }
    },
  });

  safeHandle("movies:load", (): MoviesPayload | null => cache.load());

  safeHandle("movies:tmdb-key-get", () => {
    const key = loadTmdbApiKey();
    return { ok: true as const, key, source: getTmdbApiKeySource() };
  });

  safeHandle("movies:tmdb-key-set", (_evt: unknown, key: string) => {
    const requested = typeof key === "string" ? key.trim() : "";
    const next = saveTmdbApiKey(requested);
    // 非空 key 但保存失败（如 safeStorage 不可用拒绝明文）→ 明确报错
    if (!next && requested) {
      return { ok: false as const, reason: "no_safe_storage" };
    }
    cache.setTmdbApiKey(next);
    return { ok: true as const };
  });

  safeHandle("movies:watchlist-list", () => ({ ok: true as const, items: listMovieWatchlist() }));
  safeHandle("movies:watchlist-toggle", (_evt: unknown, input: any) => {
    const result = toggleMovieWatchlist(input);
    if (!result.ok) return result;
    if (!result.watched && result.item.reminderId) reminders.remove(result.item.reminderId);
    if (result.watched) {
      const triggerAt = releaseReminderTime(result.item.releaseDate);
      if (triggerAt && triggerAt > Date.now()) {
        const created = reminders.create({ title: `${result.item.title} 上映提醒`, triggerAt, repeat: "once" });
        if (created.ok && created.reminder) setMovieWatchlistReminder(result.item.movieId, result.item.cityId, created.reminder.id);
      }
    }
    return { ok: true as const, watched: result.watched, items: listMovieWatchlist() };
  });

  safeHandle(
    "movies:refresh",
    async (_evt: unknown, cityId?: number): Promise<MoviesPayload> => {
      try {
        const payload = await cache.refresh({ cityId });
        if (payload && payload.source === "sample") {
          mainLog.warn("[ipc] movies:refresh fell back to sample (L1-L3 failed)");
        } else if (payload && payload.degraded) {
          mainLog.warn("[ipc] movies:refresh using stale cache (L1-L3 failed)");
        }
        return payload;
      } catch (err: any) {
        const reason =
          err && typeof err === "object" && "reason" in err ? (err as any).reason : null;
        mainLog.warn(`[ipc] movies:refresh failed: reason=${reason}, msg=${errMsg(err)}`);
        return { nowPlaying: [], coming: [], fetchedAt: Date.now(), source: "error" };
      }
    },
  );

  safeHandle(
    "movies:detail",
    async (_evt: unknown, movieId: string): Promise<MovieItem | { ok: false; reason: string }> => {
      if (!movieId || typeof movieId !== "string") {
        return { ok: false, reason: "invalid_args" };
      }
      const listed = cache.getItem(movieId);
      if (listed && listed.source === SOURCE.TMDB) {
        if (!loadTmdbApiKey()) return listed;
        try {
          const city = getMovieCity(cache.cityId());
          return await fetchTmdbDetail({
            httpClient,
            apiKey: loadTmdbApiKey(),
            movieId,
            language: (city && city.language) || "zh-HK",
            timeoutMs: TIMEOUT_MS,
          });
        } catch (err: any) {
          mainLog.warn(`[ipc] movies:detail tmdb failed: id=${movieId}, msg=${errMsg(err)}`);
          return listed;
        }
      }
      if (!shouldFetchMaoyanDetail(listed)) {
        return listed;
      }
      try {
        return await fetchMaoyanDetail({ httpClient, movieId, timeoutMs: TIMEOUT_MS });
      } catch (err: any) {
        if (listed) return listed;
        const reason =
          err && typeof err === "object" && "reason" in err ? (err as any).reason : "threw";
        mainLog.warn(`[ipc] movies:detail failed: id=${movieId}, reason=${reason}`);
        return { ok: false, reason };
      }
    },
  );

  safeHandle("movies:cinema-filters", async (_evt: unknown, input: any) => {
    const cityId = input && input.cityId;
    if (!supportsMaoyanShowtimes(cityId)) return { ok: false, reason: "unsupported_city" };
    try {
      return await fetchMaoyanCinemaFilters({ httpClient, cityId, timeoutMs: TIMEOUT_MS });
    } catch (err: any) {
      const reason =
        err && typeof err === "object" && "reason" in err ? (err as any).reason : "threw";
      mainLog.warn(`[ipc] movies:cinema-filters failed: city=${cityId}, reason=${reason}`);
      return { ok: false, reason };
    }
  });

  safeHandle("movies:cinemas", async (_evt: unknown, input: any) => {
    const movieId = input && input.movieId;
    const cityId = input && input.cityId;
    if (!movieId || typeof movieId !== "string") return { ok: false, reason: "invalid_args" };
    if (!supportsMaoyanShowtimes(cityId)) return { ok: false, reason: "unsupported_city" };
    const listed = cache.getItem(movieId);
    if (listed && (listed.isSample || listed.source === SOURCE.TMDB || listed.source === SOURCE.SAMPLE)) {
      return { ok: false, reason: "unsupported_source" };
    }
    try {
      return await fetchMaoyanCinemas({
        httpClient,
        movieId,
        cityId,
        day: input.day,
        districtId: input.districtId,
        areaId: input.areaId,
        offset: input.offset,
        timeoutMs: TIMEOUT_MS,
      });
    } catch (err: any) {
      const reason =
        err && typeof err === "object" && "reason" in err ? (err as any).reason : "threw";
      mainLog.warn(`[ipc] movies:cinemas failed: id=${movieId}, reason=${reason}`);
      return { ok: false, reason };
    }
  });

  safeHandle("movies:cinema-shows", async (_evt: unknown, input: any) => {
    const movieId = input && input.movieId;
    const cinemaId = input && input.cinemaId;
    const cityId = input && input.cityId;
    if (!movieId || !cinemaId || typeof movieId !== "string" || typeof cinemaId !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    if (!supportsMaoyanShowtimes(cityId)) return { ok: false, reason: "unsupported_city" };
    try {
      return await fetchMaoyanCinemaShows({
        httpClient,
        movieId,
        cinemaId,
        cityId,
        day: input.day,
        timeoutMs: TIMEOUT_MS,
      });
    } catch (err: any) {
      const reason =
        err && typeof err === "object" && "reason" in err ? (err as any).reason : "threw";
      mainLog.warn(`[ipc] movies:cinema-shows failed: cinema=${cinemaId}, reason=${reason}`);
      return { ok: false, reason };
    }
  });
}

function releaseReminderTime(releaseDate?: string): number | null {
  if (!releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return null;
  const date = new Date(`${releaseDate}T09:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

module.exports = { registerMoviesHandlers, UPDATED_CHANNEL };
