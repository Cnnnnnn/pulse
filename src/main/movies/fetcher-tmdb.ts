"use strict";

/**
 * src/main/movies/fetcher-tmdb.ts
 *
 * 电影模块 L3 兜底 fetcher（P0）.
 *   TMDB `movie/now_playing` + `movie/upcoming` (region=CN，language=zh-CN).
 *   可选 API key：缺失 → 抛 fetch_failed，cache 直接跳 L4 内置示例.
 *
 * 不属于「实时票房/购票」范畴，仅提供全球片单片单兜底.
 * 详情富化（credits/videos）不在 P0，见 PRD R6（P1）.
 */

import { SOURCE } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const DEFAULT_TIMEOUT_MS = 10000;

function withReason(reason: string, msg: string): Error {
  const err: any = new Error(`movies: tmdb ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

/** L3：拉 now_playing + upcoming（region=CN），归一化为 MovieItem 双列表 */
export async function fetchTmdbLists({
  httpClient,
  apiKey,
  region = "CN",
  language = "zh-CN",
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") throw withReason("fetch_failed", "httpClient missing");
  // 可选 key 缺失 → 直接放弃 L3，cache 跳 L4
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw withReason("fetch_failed", "no api key");
  }
  const nowUrl = `${TMDB_BASE}/movie/now_playing?api_key=${encodeURIComponent(apiKey)}&region=${region}&language=${language}`;
  const comingUrl = `${TMDB_BASE}/movie/upcoming?api_key=${encodeURIComponent(apiKey)}&region=${region}&language=${language}`;
  const [nowRaw, comingRaw] = await Promise.all([
    getJson(httpClient, nowUrl, timeoutMs, "now_playing"),
    getJson(httpClient, comingUrl, timeoutMs, "upcoming"),
  ]);
  const nowPlaying = normalizeTmdb((nowRaw.results as any[]) || [], "now");
  const coming = normalizeTmdb((comingRaw.results as any[]) || [], "coming");
  if (nowPlaying.length === 0 && coming.length === 0) {
    throw withReason("parse_failed", "both lists empty");
  }
  return {
    nowPlaying,
    coming,
    fetchedAt: Date.now(),
    source: SOURCE.TMDB,
  };
}

async function getJson(httpClient: any, url: string, timeoutMs: number, _tag: string): Promise<any> {
  const res: any = await httpClient.get(url, { timeout: timeoutMs });
  if (res && (res.error === "timeout" || res.error === "network")) throw withReason("http_timeout", res.error);
  if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) {
    throw withReason("fetch_failed", `status=${res && res.status}`);
  }
  let raw: any;
  try {
    raw = JSON.parse(res.body);
  } catch {
    throw withReason("parse_failed", "json parse threw");
  }
  if (!raw || typeof raw !== "object") throw withReason("parse_failed", "payload not object");
  return raw;
}

export function normalizeTmdb(arr: any[], _kind: "now" | "coming"): any[] {
  if (!Array.isArray(arr)) return [];
  const out: any[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const id = e.id != null ? String(e.id) : null;
    if (!id) continue;
    const posterPath = typeof e.poster_path === "string" && e.poster_path ? `${TMDB_IMG}${e.poster_path}` : undefined;
    const item: any = {
      id,
      title: e.title || e.original_title || "未命名",
      enTitle: e.original_title || undefined,
      rating: typeof e.vote_average === "number" ? e.vote_average : undefined,
      poster: posterPath,
      releaseDate: e.release_date || undefined,
      // L3 列表不补 wish/showInfo/genres（genre_ids 是数字，需二次映射，留 P1）
      source: SOURCE.TMDB,
    };
    out.push(item);
  }
  return out;
}

module.exports = { fetchTmdbLists, normalizeTmdb };
