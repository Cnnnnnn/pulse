"use strict";

/**
 * src/main/concerts/fetcher-moretickets.ts
 *
 * 摩天轮国际站 fetcher（演出票监控模块）.
 *   GET  /pub/search/v1/search?keyword=      → 关键词搜演出（拿 tourId/showId）
 *   GET  /pub/tour/v1/tour_detail            → 巡演标题/海报
 *   POST /pub/tour/v1/tour_session_list      → 场次列表（minPrice/originalPrice/hasTicket）
 *
 * 全部接口要求一组上下文 header（oc/lc/cc/lan/src/channel），从主站 SPA
 * 的请求拦截器里逆向出来（2026-08 实测缺任一可能返回 statusCode 12123 /
 * 空场次）。POST body 分页形如 { page: { beforePage: { length, offset } } }。
 *
 * 国内主站 motianlun.cn 是独立后端（tking 体系），不在本 fetcher 范围。
 */

import type { ConcertPlatform } from "../../shared/concerts-constants";

const API_BASE = "https://api-global.moretickets.com";
const DEFAULT_TIMEOUT_MS = 10000;
const SESSION_PAGE_SIZE = 50;

/** SPA onRequest 拦截器带的全量上下文；locale/currency 决定返回币种 */
const CONTEXT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://www.moretickets.com",
  Referer: "https://www.moretickets.com/",
  oc: "MTS",
  lc: "CN-HK",
  cc: "HKD",
  lan: "zh-Hant",
  src: "PC",
  channel: "PC",
};

function withReason(reason: string, msg: string): Error {
  const err: any = new Error(`concerts: moretickets ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

function assertPayloadOk(raw: any): void {
  if (!raw || typeof raw !== "object") throw withReason("parse_failed", "payload not object");
  // 网关层错误：statusCode !== 200（如 12123 请求错误 / 12308 参数错误）
  if (raw.statusCode != null && raw.statusCode !== 200) {
    throw withReason("fetch_failed", `statusCode=${raw.statusCode} ${raw.message || ""}`.trim());
  }
}

async function getJson(httpClient: any, url: string, timeoutMs: number): Promise<any> {
  const res: any = await httpClient.get(url, { timeout: timeoutMs, headers: CONTEXT_HEADERS });
  if (res && (res.error === "timeout" || res.error === "network")) {
    throw withReason("http_timeout", res.error);
  }
  if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) {
    throw withReason("fetch_failed", `status=${res && res.status}`);
  }
  let raw: any;
  try {
    raw = JSON.parse(res.body);
  } catch {
    throw withReason("parse_failed", "json parse threw");
  }
  assertPayloadOk(raw);
  return raw;
}

async function postJson(httpClient: any, url: string, body: any, timeoutMs: number): Promise<any> {
  const res: any = await httpClient.post(url, body, CONTEXT_HEADERS, { timeout: timeoutMs });
  if (res && (res.error === "timeout" || res.error === "network")) {
    throw withReason("http_timeout", res.error);
  }
  if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) {
    throw withReason("fetch_failed", `status=${res && res.status}`);
  }
  let raw: any;
  try {
    raw = JSON.parse(res.body);
  } catch {
    throw withReason("parse_failed", "json parse threw");
  }
  assertPayloadOk(raw);
  return raw;
}

function priceToString(v: unknown): string | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : undefined;
}

function normalizeSessionStatus(status: unknown): string {
  const s = typeof status === "string" ? status.toUpperCase() : "";
  if (s === "ONSALE") return "ONSALE";
  if (s === "SOLDOUT") return "SOLDOUT";
  if (s === "UPCOMING") return "UPCOMING";
  return s || "ENDED";
}

export interface MoreticketsSnapshot {
  platform: ConcertPlatform;
  key: string;
  tourId: string;
  showId: string;
  title: string;
  /** 巡演级名称（tour_detail）；title 通常已是具体场次/站点名 */
  tourName?: string;
  city?: string;
  venue?: string;
  posterUrl?: string;
  detailUrl: string;
  sessions: any[];
  fetchedAt: number;
  source: string;
}

/** 拉巡演详情 + 全部在售场次实时最低价 */
export async function fetchMoreticketsTour({
  httpClient,
  tourId,
  showId,
  completedSession = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<MoreticketsSnapshot> {
  if (!httpClient || typeof httpClient.post !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }
  const tid = tourId != null ? String(tourId).trim() : "";
  const sid = showId != null ? String(showId).trim() : "";
  if (!tid || !sid) throw withReason("invalid_args", "tourId/showId missing");

  let tourName: string | undefined;
  try {
    const detail = await getJson(
      httpClient,
      `${API_BASE}/pub/tour/v1/tour_detail?tourId=${encodeURIComponent(tid)}&showId=${encodeURIComponent(sid)}`,
      timeoutMs,
    );
    tourName = detail && detail.data && detail.data.tourName;
  } catch {
    /* 详情失败不阻塞场次列表（标题有兜底） */
  }

  const listed = await postJson(httpClient, `${API_BASE}/pub/tour/v1/tour_session_list`, {
    tourId: tid,
    showId: sid,
    completedSession,
    page: { beforePage: { length: SESSION_PAGE_SIZE, offset: 0 } },
  }, timeoutMs);
  const data = listed.data || {};
  const snapshot = normalizeMoreticketsSessions(data.sessionList || [], tid, sid);
  // 场次名（具体到站点）优先；巡演级 tourName 只做兜底，另存字段供 UI 展示
  if (tourName) {
    snapshot.tourName = tourName;
    if (!snapshot.title || snapshot.title === "未命名演出") snapshot.title = tourName;
  }
  return snapshot;
}

/** 场次列表 → 统一快照。showName/sessionName 均可做标题兜底 */
export function normalizeMoreticketsSessions(
  arr: any[],
  tourId: string,
  showId: string,
): MoreticketsSnapshot {
  const sessions: any[] = [];
  let firstShowName: string | undefined;
  for (const e of arr) {
    if (!e || typeof e !== "object" || e.sessionId == null) continue;
    if (!firstShowName && typeof e.showName === "string") firstShowName = e.showName;
    const price = e.price && typeof e.price === "object" ? e.price : {};
    sessions.push({
      id: String(e.sessionId),
      name: e.sessionName || (e.dateItem && `${e.dateItem.year}-${e.dateItem.month}-${e.dateItem.dayOfMonth} ${e.dateItem.weekday || ""}`) || `场次 ${e.sessionId}`,
      time:
        e.dateItem &&
        `${e.dateItem.year || ""}-${String(e.dateItem.month || "").padStart(2, "0")}-${String(e.dateItem.dayOfMonth || "").padStart(2, "0")} ${e.dateItem.time || ""}`.trim(),
      minPrice: priceToString(price.minSalePrice != null ? price.minSalePrice : e.minPrice),
      originalPrice: priceToString(e.originalPrice),
      currencySymbol: price.currencySymbol || e.currencySymbol || "HK$",
      status: normalizeSessionStatus(e.sessionStatus),
      hasTicket: Boolean(e.hasTicket),
    });
  }
  return {
    platform: "moretickets",
    key: `moretickets:${tourId}/${showId}`,
    tourId,
    showId,
    title: firstShowName || "未命名演出",
    venue: arr[0] && arr[0].venueName ? String(arr[0].venueName).trim() : undefined,
    city: arr[0] && arr[0].cityName ? String(arr[0].cityName).trim() : undefined,
    posterUrl: undefined,
    detailUrl: `https://www.moretickets.com/tour-detail?tourId=${tourId}&showId=${showId}`,
    sessions,
    fetchedAt: Date.now(),
    source: "moretickets-api",
  };
}

export interface MoreticketsSearchHit {
  tourId?: string;
  showId?: string;
  title: string;
  location?: string;
  imgUrl?: string;
  status?: string;
}

/** 关键词搜索（「添加监听」辅助定位 tourId/showId） */
export async function searchMoreticketsShows({
  httpClient,
  keyword,
  limit = 10,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<{ ok: true; keyword: string; hits: MoreticketsSearchHit[] }> {
  if (!httpClient || typeof httpClient.get !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }
  const kw = typeof keyword === "string" ? keyword.trim() : "";
  if (!kw) throw withReason("invalid_args", "keyword missing");
  const raw = await getJson(
    httpClient,
    `${API_BASE}/pub/search/v1/search?keyword=${encodeURIComponent(kw)}`,
    timeoutMs,
  );
  const list = Array.isArray(raw.data) ? raw.data.slice(0, limit) : [];
  return { ok: true as const, keyword: kw, hits: normalizeMoreticketsSearchHits(list) };
}

export function normalizeMoreticketsSearchHits(list: any[]): MoreticketsSearchHit[] {
  const out: MoreticketsSearchHit[] = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const nav = typeof s.navigateUrl === "string" ? s.navigateUrl : "";
    const tidMatch = nav.match(/[?&]tourId=([^&]+)/);
    const sidMatch = nav.match(/[?&]showId=([^&]+)/);
    out.push({
      tourId: tidMatch ? tidMatch[1] : undefined,
      showId: sidMatch ? sidMatch[1] : undefined,
      title: s.title || s.showName || "未命名",
      location: s.location || undefined,
      imgUrl: s.imgUrl || undefined,
      status: s.status || undefined,
    });
  }
  return out;
}

module.exports = {
  fetchMoreticketsTour,
  searchMoreticketsShows,
  normalizeMoreticketsSessions,
  normalizeMoreticketsSearchHits,
};
