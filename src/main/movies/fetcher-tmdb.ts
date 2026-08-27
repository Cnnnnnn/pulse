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
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w780";
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
  let coming = normalizeTmdb((comingRaw.results as any[]) || [], "coming");
  let comingNote: string | undefined;
  // TMDB upcoming 对澳门几乎无数据；档期与香港高度重叠，空则回退香港待映
  if (coming.length === 0 && String(region).toUpperCase() === "MO") {
    try {
      const hkRaw = await getJson(
        httpClient,
        `${TMDB_BASE}/movie/upcoming?api_key=${encodeURIComponent(apiKey)}&region=HK&language=${language}`,
        timeoutMs,
        "upcoming",
      );
      coming = normalizeTmdb((hkRaw.results as any[]) || [], "coming");
      if (coming.length) comingNote = "暂无澳门待映档期，以下为香港即将上映";
    } catch {
      /* 保持空 coming */
    }
  }
  if (nowPlaying.length === 0 && coming.length === 0) {
    throw withReason("parse_failed", "both lists empty");
  }
  return {
    nowPlaying,
    coming,
    fetchedAt: Date.now(),
    source: SOURCE.TMDB,
    comingNote,
  };
}

/** 单片详情：overview + credits + videos（YouTube 预告） */
export async function fetchTmdbDetail({
  httpClient,
  apiKey,
  movieId,
  language = "zh-HK",
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") throw withReason("fetch_failed", "httpClient missing");
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw withReason("fetch_failed", "no api key");
  }
  if (!movieId) throw withReason("fetch_failed", "no movieId");
  const url =
    `${TMDB_BASE}/movie/${encodeURIComponent(String(movieId))}` +
    `?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}` +
    `&append_to_response=credits,videos&include_video_language=zh-HK,zh-TW,zh-CN,en,null`;
  const raw = await getJson(httpClient, url, timeoutMs, "detail");
  const detail = normalizeTmdbDetail(raw);
  detail.id = String(movieId);
  return detail;
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

export function formatComingDate(iso?: string): string | undefined {
  if (!iso || typeof iso !== "string") return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return `${Number(m[2])}月${Number(m[3])}日 上映`;
}

export function normalizeTmdb(arr: any[], kind: "now" | "coming"): any[] {
  if (!Array.isArray(arr)) return [];
  const out: any[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const id = e.id != null ? String(e.id) : null;
    if (!id) continue;
    const posterPath = typeof e.poster_path === "string" && e.poster_path ? `${TMDB_IMG}${e.poster_path}` : undefined;
    const releaseDate = e.release_date || undefined;
    const item: any = {
      id,
      title: e.title || e.original_title || "未命名",
      enTitle: e.original_title || undefined,
      rating: typeof e.vote_average === "number" ? e.vote_average : undefined,
      poster: posterPath,
      releaseDate,
      source: SOURCE.TMDB,
    };
    if (kind === "coming") item.comingTitle = formatComingDate(releaseDate);
    out.push(item);
  }
  if (kind === "coming") {
    out.sort((a, b) => String(a.releaseDate || "").localeCompare(String(b.releaseDate || "")));
  }
  return out;
}

export function pickYoutubeTrailer(videos: any[]): string | undefined {
  if (!Array.isArray(videos)) return undefined;
  const yt = videos.filter((v) => v && v.site === "YouTube" && v.key && (v.type === "Trailer" || v.type === "Teaser"));
  const pick =
    yt.find((v) => v.type === "Trailer" && v.official) ||
    yt.find((v) => v.type === "Trailer") ||
    yt[0];
  return pick ? `https://www.youtube.com/watch?v=${pick.key}` : undefined;
}

export function normalizeTmdbDetail(raw: any): any {
  const r = raw && typeof raw === "object" ? raw : {};
  const credits = r.credits && typeof r.credits === "object" ? r.credits : {};
  const crew = Array.isArray(credits.crew) ? credits.crew : [];
  const cast = Array.isArray(credits.cast) ? credits.cast : [];
  const director = crew.filter((c: any) => c && c.job === "Director" && c.name).map((c: any) => c.name).join("、");
  const star = cast.filter((c: any) => c && c.name).slice(0, 8).map((c: any) => c.name).join("、");
  const genres = Array.isArray(r.genres)
    ? r.genres.map((g: any) => g && g.name).filter(Boolean)
    : undefined;
  const videos = r.videos && Array.isArray(r.videos.results) ? r.videos.results : [];
  const posterPath = typeof r.poster_path === "string" && r.poster_path ? `${TMDB_IMG}${r.poster_path}` : undefined;
  const backdropPath =
    typeof r.backdrop_path === "string" && r.backdrop_path ? `${TMDB_BACKDROP}${r.backdrop_path}` : posterPath;
  return {
    title: r.title || r.original_title || "未命名",
    enTitle: r.original_title || undefined,
    rating: typeof r.vote_average === "number" ? r.vote_average : undefined,
    poster: posterPath,
    backdrop: backdropPath,
    releaseDate: r.release_date || undefined,
    durationMin: typeof r.runtime === "number" && r.runtime > 0 ? r.runtime : undefined,
    summary: r.overview || undefined,
    genres: genres && genres.length ? genres : undefined,
    director: director || undefined,
    star: star || undefined,
    trailerUrl: pickYoutubeTrailer(videos),
    source: SOURCE.TMDB,
  };
}

module.exports = {
  fetchTmdbLists,
  fetchTmdbDetail,
  normalizeTmdb,
  normalizeTmdbDetail,
  formatComingDate,
  pickYoutubeTrailer,
};
