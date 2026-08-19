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

const URL_NETSTART_NOW = "https://apis.netstart.cn/maoyan/index/movieOnInfoList";
const URL_NETSTART_COMING = "https://apis.netstart.cn/maoyan/index/comingList?ci=1&limit=50";
const URL_DIRECT_NOW = "https://m.maoyan.com/ajax/movieOnInfoList";
const URL_DIRECT_COMING = "https://m.maoyan.com/ajax/comingList?ci=1&limit=50";
const URL_DIRECT_DETAIL = "https://m.maoyan.com/ajax/detailmovie";
const DEFAULT_TIMEOUT_MS = 10000;

const DIRECT_HEADERS = { Referer: MAOYAN_REFERER, "User-Agent": MOBILE_UA };

function withReason(reason: string, msg: string): Error {
  const err: any = new Error(`movies: ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

/** 拉热映+即将上映；useDirect=false 走封装(maoyan-netstart)，true 走直连(maoyan-direct) */
export async function fetchMaoyanLists({
  httpClient,
  useDirect = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") throw withReason("fetch_failed", "httpClient missing");
  const nowUrl = useDirect ? URL_DIRECT_NOW : URL_NETSTART_NOW;
  const comingUrl = useDirect ? URL_DIRECT_COMING : URL_NETSTART_COMING;
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

module.exports = { fetchMaoyanLists, fetchMaoyanDetail, normalizeMaoyanList, normalizeMaoyanDetail };
