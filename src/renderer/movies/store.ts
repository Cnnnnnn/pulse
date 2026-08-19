/**
 * src/renderer/movies/store.ts
 *
 * 渲染端 signals + bootstrap + 30s 冷却 + 详情缓存.
 * 复用 shared/data-state 的 ready/stale/error 契约 + @preact/signals.
 * Mirror src/renderer/wechat-hot/store.ts 风格.
 */

import { signal, computed } from "@preact/signals";
import { api } from "../api.ts";
import {
  beginDataRequest,
  createDataState,
  rejectData,
  resolveData,
} from "../../shared/data-state.ts";
import type { DataSource, DataState } from "../../shared/data-state.ts";

const COOLDOWN_MS = 30000;

export const moviesNowPlaying = signal<any[]>([]);
export const moviesComing = signal<any[]>([]);
export const moviesLoaded = signal(false);
export const moviesLoading = signal(false);
export const moviesError = signal<string | null>(null);
/** 当前 payload.source（驱动「示例」徽标） */
export const moviesSource = signal("");
export const moviesDataState = signal<DataState<any>>(
  createDataState({ nowPlaying: [], coming: [] }),
);
export const moviesLastFetched = signal(0);
export const moviesLastRefreshAt = signal(0);
export const moviesUpdatedUnsub = signal<null | (() => void)>(null);
export const moviesActiveTab = signal<"now" | "coming">("now");
export const moviesDetailCache = signal<Record<string, any>>({});
export const moviesDetailLoading = signal(false);
export const moviesDetailError = signal<string | null>(null);

/** 当前 tab 对应的列表（卡片渲染直接消费） */
export const moviesActiveList = computed(() =>
  moviesActiveTab.value === "coming" ? moviesComing.value : moviesNowPlaying.value,
);

export function applyMoviesPayload(payload: any, source: DataSource = "live") {
  if (!payload || typeof payload !== "object") return;
  moviesNowPlaying.value = Array.isArray(payload.nowPlaying) ? payload.nowPlaying : [];
  moviesComing.value = Array.isArray(payload.coming) ? payload.coming : [];
  moviesLastFetched.value = payload.fetchedAt || 0;
  moviesSource.value = payload.source || "";
  moviesLoaded.value = true;
  moviesError.value = null;
  moviesDataState.value = resolveData(moviesDataState.value, payload, {
    source,
    fetchedAt: payload.fetchedAt || undefined,
  });
}

export async function bootstrapMoviesTab() {
  try {
    const cached = await api.moviesLoad();
    applyMoviesPayload(cached, "cache");
    if (
      !cached ||
      !Array.isArray(cached.nowPlaying) ||
      cached.nowPlaying.length === 0
    ) {
      await refreshMovies();
    }
  } catch {
    await refreshMovies();
  }
}

export async function refreshMovies(): Promise<boolean> {
  if (moviesLoading.value) return false;
  const now = Date.now();
  if (now - moviesLastRefreshAt.value < COOLDOWN_MS) return false;
  moviesLastRefreshAt.value = now;
  moviesLoading.value = true;
  moviesDataState.value = beginDataRequest(moviesDataState.value);
  moviesError.value = null;
  try {
    const r = await api.moviesRefresh();
    if (!r || !Array.isArray(r.nowPlaying) || r.nowPlaying.length === 0) {
      const reason = (r && (r as any).reason) || "empty";
      moviesError.value = mapReason(reason);
      moviesDataState.value = rejectData(moviesDataState.value, moviesError.value);
      return false;
    }
    applyMoviesPayload(r, "live");
    return true;
  } catch (err: any) {
    moviesError.value = (err && err.message) || "刷新失败";
    moviesDataState.value = rejectData(moviesDataState.value, moviesError.value);
    return false;
  } finally {
    moviesLoading.value = false;
  }
}

export async function fetchMovieDetail(movieId: string): Promise<any | null> {
  if (!movieId || typeof movieId !== "string") return null;
  const cache = moviesDetailCache.value;
  if (cache[movieId]) return cache[movieId];
  moviesDetailLoading.value = true;
  moviesDetailError.value = null;
  try {
    const r = await api.moviesDetail(movieId);
    if (!r || (r as any).ok === false) {
      moviesDetailError.value = (r && (r as any).reason) || "详情拉取失败";
      return null;
    }
    moviesDetailCache.value = { ...moviesDetailCache.value, [movieId]: r };
    return r;
  } catch (err: any) {
    moviesDetailError.value = (err && err.message) || "详情拉取失败";
    return null;
  } finally {
    moviesDetailLoading.value = false;
  }
}

export function subscribeMoviesUpdates() {
  if (moviesUpdatedUnsub.value) return; // 幂等
  const unsub = api.onMoviesUpdated((payload: any) => {
    applyMoviesPayload(payload, "live");
  });
  moviesUpdatedUnsub.value = typeof unsub === "function" ? unsub : null;
}

export function cleanupMoviesUpdates() {
  if (moviesUpdatedUnsub.value) {
    try {
      moviesUpdatedUnsub.value();
    } catch {
      /* noop */
    }
    moviesUpdatedUnsub.value = null;
  }
}

const REASON_MAP: Record<string, string> = {
  fetch_failed: "拉取失败，请检查网络连接后重试",
  parse_failed: "片单解析失败，可能是源结构变化，请稍后重试",
  http_timeout: "网络连接超时，请重试",
  invalid_args: "参数错误",
  threw: "拉取异常",
  ipc_unavailable: "系统通信异常，请重启应用",
};
function mapReason(reason: any): string {
  return REASON_MAP[reason] || reason || "刷新失败";
}
