"use strict";

/**
 * src/main/movies/fetcher-maoyan.ts
 *
 * 猫眼主源 fetcher（电影模块 P0）.
 *   L1 封装: apis.netstart.cn/maoyan/index/{movieOnInfoList,comingList}（免 UA 伪装）
 *   L2 直连: m.maoyan.com/ajax/{movieOnInfoList,comingList,detailmovie}（需移动 UA + Referer）
 *   详情: 仅直连（封装无 detail 代理，已实测 404）
 *
 * 不导入 electron / node:http — 边界在 cache.ts / register-movies.ts.
 * 实时丑闻/票房数字（dashboard 爬虫）明确不在 P0 范围.
 */

import { normalizePoster, splitGenres, SOURCE } from "./types";
import { MOBILE_UA, MAOYAN_REFERER } from "../../utils/http-constants";
import { sanitizeMovieCityId } from "../../shared/movies-constants";

const URL_NETSTART_NOW = "https://apis.netstart.cn/maoyan/index/movieOnInfoList";
const URL_DIRECT_NOW = "https://m.maoyan.com/ajax/movieOnInfoList";
const URL_DIRECT_DETAIL = "https://m.maoyan.com/ajax/detailmovie";
const URL_CINEMA_LIST = "https://m.maoyan.com/ajax/cinemaList";
const URL_CINEMA_DETAIL = "https://m.maoyan.com/ajax/cinemaDetail";
const URL_FILTER_CINEMAS = "https://m.maoyan.com/ajax/filterCinemas";
const DEFAULT_TIMEOUT_MS = 10000;
const CINEMA_LIST_LIMIT = 20;

function filterId(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : -1;
}

const DIRECT_HEADERS = { Referer: MAOYAN_REFERER, "User-Agent": MOBILE_UA };

function withReason(reason: string, msg: string): Error {
  const err: any = new Error(`movies: ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

/** 拉热映+即将上映；useDirect=false 走封装(maoyan-netstart)，true 走直连(maoyan-direct) */
function comingListUrl(useDirect: boolean, cityId: unknown): string {
  const ci = sanitizeMovieCityId(cityId);
  const path = `comingList?ci=${ci}&limit=50`;
  return useDirect
    ? `https://m.maoyan.com/ajax/${path}`
    : `https://apis.netstart.cn/maoyan/index/${path}`;
}

export async function fetchMaoyanLists({
  httpClient,
  useDirect = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cityId,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") throw withReason("fetch_failed", "httpClient missing");
  const nowUrl = useDirect ? URL_DIRECT_NOW : URL_NETSTART_NOW;
  const comingUrl = comingListUrl(useDirect, cityId);
  const headers = useDirect ? DIRECT_HEADERS : undefined;
  const [nowRaw, comingRaw] = await Promise.all([
    getJson(httpClient, nowUrl, headers, timeoutMs, "movieList"),
    getJson(httpClient, comingUrl, headers, timeoutMs, "coming"),
  ]);
  const nowPlaying = normalizeMaoyanList(nowRaw.movieList || [], "now");
  const coming = normalizeMaoyanList(comingRaw.coming || [], "coming");
  if (nowPlaying.length === 0 && coming.length === 0) {
    throw withReason("parse_failed", "both lists empty");
  }
  return {
    nowPlaying,
    coming,
    fetchedAt: Date.now(),
    source: useDirect ? SOURCE.MAOYAN_DIRECT : SOURCE.MAOYAN_NETSTART,
  };
}

/** 拉详情（仅直连 m.maoyan.com/ajax/detailmovie） */
export async function fetchMaoyanDetail({
  httpClient,
  movieId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") throw withReason("fetch_failed", "httpClient missing");
  const raw = await getJson(httpClient, `${URL_DIRECT_DETAIL}?movieId=${movieId}`, DIRECT_HEADERS, timeoutMs, "detailMovie");
  const detail = normalizeMaoyanDetail(raw.detailMovie || raw);
  detail.id = String(movieId);
  detail.source = SOURCE.MAOYAN_DIRECT;
  return detail;
}

/** 城市行政区 / 商圈筛选项（filterCinemas） */
export async function fetchMaoyanCinemaFilters({
  httpClient,
  cityId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") throw withReason("fetch_failed", "httpClient missing");
  const ci = sanitizeMovieCityId(cityId);
  const raw = await getJson(
    httpClient,
    `${URL_FILTER_CINEMAS}?ci=${ci}`,
    DIRECT_HEADERS,
    timeoutMs,
    "filterCinemas",
  );
  const districts = normalizeMaoyanDistricts(raw && raw.district && raw.district.subItems);
  return {
    ok: true,
    cityId: ci,
    districts,
    source: SOURCE.MAOYAN_DIRECT,
  };
}

/** 某城某日上映该片的影院列表（不含逐场次；点进一家再拉 cinemaDetail） */
export async function fetchMaoyanCinemas({
  httpClient,
  movieId,
  cityId,
  day,
  districtId = -1,
  areaId = -1,
  offset = 0,
  limit = CINEMA_LIST_LIMIT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") throw withReason("fetch_failed", "httpClient missing");
  if (!movieId) throw withReason("invalid_args", "movieId missing");
  const ci = sanitizeMovieCityId(cityId);
  const showDay = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10);
  const did = filterId(districtId);
  const aid = filterId(areaId);
  const url =
    `${URL_CINEMA_LIST}?movieId=${encodeURIComponent(String(movieId))}` +
    `&ci=${ci}&day=${showDay}&offset=${Number(offset) || 0}&limit=${Number(limit) || CINEMA_LIST_LIMIT}` +
    `&districtId=${did}&areaId=${aid}&lineId=-1&stationId=-1&brandId=-1&serviceId=-1&hallType=-1`;
  const raw = await getJson(httpClient, url, DIRECT_HEADERS, timeoutMs, "cinemas");
  const cinemas = normalizeMaoyanCinemas(raw.cinemas || []);
  const paging = raw.paging && typeof raw.paging === "object" ? raw.paging : {};
  return {
    ok: true,
    movieId: String(movieId),
    cityId: ci,
    day: showDay,
    districtId: did,
    areaId: aid,
    cinemas,
    hasMore: Boolean(paging.hasMore),
    total: typeof paging.total === "number" ? paging.total : cinemas.length,
    source: SOURCE.MAOYAN_DIRECT,
  };
}

/** 某影院对该片的排片场次（按日期分组） */
export async function fetchMaoyanCinemaShows({
  httpClient,
  movieId,
  cinemaId,
  cityId,
  day,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") throw withReason("fetch_failed", "httpClient missing");
  if (!movieId || !cinemaId) throw withReason("invalid_args", "movieId/cinemaId missing");
  const ci = sanitizeMovieCityId(cityId);
  const url =
    `${URL_CINEMA_DETAIL}?cinemaId=${encodeURIComponent(String(cinemaId))}` +
    `&movieId=${encodeURIComponent(String(movieId))}&ci=${ci}`;
  const raw = await getJson(httpClient, url, DIRECT_HEADERS, timeoutMs, "cinemaDetail");
  const showData = raw.showData || {};
  const movies = Array.isArray(showData.movies) ? showData.movies : [];
  const mid = String(movieId);
  const movie =
    movies.find((m: any) => m && String(m.id) === mid) ||
    movies[0] ||
    null;
  const days = normalizeMaoyanShowDays(movie && movie.shows, day);
  return {
    ok: true,
    movieId: mid,
    cinemaId: String(cinemaId),
    cinemaName: showData.cinemaName || (raw.cinemaData && raw.cinemaData.nm) || undefined,
    cityId: ci,
    days,
    source: SOURCE.MAOYAN_DIRECT,
  };
}

async function getJson(
  httpClient: any,
  url: string,
  headers: any,
  timeoutMs: number,
  _arrKey: string,
): Promise<any> {
  const res: any = await httpClient.get(url, { timeout: timeoutMs, headers });
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

export function normalizeMaoyanList(arr: any[], kind: "now" | "coming"): any[] {
  if (!Array.isArray(arr)) return [];
  const out: any[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const id = e.id != null ? String(e.id) : null;
    if (!id) continue;
    const item: any = {
      id,
      title: e.nm || e.title || "未命名",
      enTitle: e.enm || undefined,
      rating: typeof e.sc === "number" ? e.sc : undefined,
      ratingLabel: e.scoreLabel || undefined,
      poster: normalizePoster(e.img),
      releaseDate: e.rt || undefined,
      source: SOURCE.MAOYAN_NETSTART,
    };
    if (kind === "now") {
      item.showInfo = e.showInfo || undefined;
    } else {
      item.wish = typeof e.wish === "number" ? e.wish : undefined;
      item.comingTitle = e.comingTitle || undefined;
      item.showState = e.showStateButton && e.showStateButton.content ? e.showStateButton.content : undefined;
    }
    if (e.star) item.star = e.star;
    out.push(item);
  }
  return out;
}

export function normalizeMaoyanDetail(raw: any): any {
  const item: any = {
    title: raw.nm || raw.title || "未命名",
    enTitle: raw.enm || raw.original_title || undefined,
    rating: typeof raw.sc === "number" ? raw.sc : undefined,
    ratingLabel: raw.scoreLabel || (raw.sc === 0 ? "暂无评分" : undefined),
    poster: normalizePoster(raw.img),
    backdrop: normalizePoster(
      Array.isArray(raw.photos) && raw.photos[0] ? raw.photos[0].replace(/@.*$/, "") : raw.img,
    ),
    releaseDate: raw.rt || undefined,
    showInfo: raw.showInfo || undefined,
    genres: splitGenres(raw.cat),
    durationMin:
      typeof raw.dur === "number"
        ? raw.dur
        : typeof raw.dur === "string"
          ? parseInt(raw.dur, 10) || undefined
          : undefined,
    summary: raw.dra || undefined,
    director: raw.dir || undefined,
    trailerUrl: raw.videourl || undefined,
    star: raw.star || undefined,
  };
  return item;
}

export function normalizeMaoyanCinemas(arr: any[]): any[] {
  if (!Array.isArray(arr)) return [];
  const out: any[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const id = e.id != null ? String(e.id) : null;
    if (!id) continue;
    const hallTypes = Array.isArray(e.tag && e.tag.hallType) ? e.tag.hallType.filter(Boolean) : [];
    out.push({
      id,
      name: e.nm || "未命名影院",
      address: e.addr || undefined,
      distance: e.distance || undefined,
      /** 列表起售价多为明文数字字符串；精确票价在场次里用 vipPrice */
      sellPrice: e.sellPrice != null && String(e.sellPrice) ? String(e.sellPrice) : undefined,
      hallTypes: hallTypes.length ? hallTypes : undefined,
      maoyanUrl: `https://m.maoyan.com/cinema/${id}`,
    });
  }
  return out;
}

/** 行政区（及下级商圈）；跳过 id=-1「全部」项，UI 自己加「全部」 */
export function normalizeMaoyanDistricts(arr: any[]): any[] {
  if (!Array.isArray(arr)) return [];
  const out: any[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const id = filterId(e.id);
    if (id < 0) continue;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (!name) continue;
    const areas = normalizeMaoyanAreas(e.subItems);
    out.push({
      id,
      name,
      count: typeof e.count === "number" ? e.count : undefined,
      areas: areas.length ? areas : undefined,
    });
  }
  return out;
}

function normalizeMaoyanAreas(arr: any[]): any[] {
  if (!Array.isArray(arr)) return [];
  const out: any[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const id = filterId(e.id);
    if (id < 0) continue;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (!name) continue;
    out.push({
      id,
      name,
      count: typeof e.count === "number" ? e.count : undefined,
    });
  }
  return out;
}

export function normalizeMaoyanShowDays(shows: any, preferDay?: string): any[] {
  if (!Array.isArray(shows)) return [];
  const days: any[] = [];
  for (const day of shows) {
    if (!day || typeof day !== "object") continue;
    const date = day.showDate || day.dt || undefined;
    const slots = normalizeMaoyanSlots(day.plist);
    if (!slots.length) continue;
    days.push({
      date,
      label: day.dateShow || date,
      slots,
    });
  }
  if (preferDay && days.length) {
    const hit = days.find((d) => d.date === preferDay);
    if (hit) return [hit, ...days.filter((d) => d !== hit)];
  }
  return days;
}

export function normalizeMaoyanSlots(plist: any): any[] {
  if (!Array.isArray(plist)) return [];
  const out: any[] = [];
  for (const p of plist) {
    if (!p || typeof p !== "object" || !p.tm) continue;
    out.push({
      time: String(p.tm),
      hall: p.th || undefined,
      lang: p.lang || undefined,
      type: p.tp || undefined,
      /** vipPrice 多为明文；stonefont 加密价忽略 */
      price: p.vipPrice != null && String(p.vipPrice) ? String(p.vipPrice) : undefined,
      seqNo: p.seqNo != null ? String(p.seqNo) : undefined,
    });
  }
  return out;
}

module.exports = {
  fetchMaoyanLists,
  fetchMaoyanDetail,
  fetchMaoyanCinemaFilters,
  fetchMaoyanCinemas,
  fetchMaoyanCinemaShows,
  normalizeMaoyanList,
  normalizeMaoyanDetail,
  normalizeMaoyanCinemas,
  normalizeMaoyanDistricts,
  normalizeMaoyanShowDays,
  normalizeMaoyanSlots,
};
