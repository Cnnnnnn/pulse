"use strict";

/**
 * src/main/concerts/fetcher-piaoniu.ts
 *
 * 票牛 fetcher（演出票监控模块）.
 *   GET /api/v1/activities/{id}                    → 演出 + 场次列表（含 lowPrice/hasTicket）
 *   GET /api/v1/ticketCategories?eventId={id}      → 某场次票档（包厢/看台等，含低售价）
 *   GET /api/v4/tickets?eventId=&ticketCategoryId= → 某票档按购票张数分组的单价
 *
 * PC 端同款接口（static.piaoniu.com/pc/activity/detail.*.js 内可见调用），
 * 免登录可访问，无签名校验（2026-08 实测）。
 * 不导入 electron / node:http — 边界在 cache.ts / register-concerts.ts.
 */

import type { ConcertPlatform } from "../../shared/concerts-constants";

const API_BASE = "https://www.piaoniu.com/api";
const DEFAULT_TIMEOUT_MS = 10000;
const DESKTOP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Referer: "https://www.piaoniu.com/",
  Accept: "application/json",
};

function withReason(reason: string, msg: string): Error {
  const err: any = new Error(`concerts: piaoniu ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

async function getJson(httpClient: any, url: string, timeoutMs: number): Promise<any> {
  const res: any = await httpClient.get(url, {
    timeout: timeoutMs,
    headers: DESKTOP_HEADERS,
  });
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
  if (!raw || typeof raw !== "object") throw withReason("parse_failed", "payload not object");
  return raw;
}

function priceToString(v: unknown): string | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  // 去掉多余尾零但保留整数（1348.00 → "1348"，1348.5 → "1348.5"）
  return String(Math.round(n * 100) / 100);
}

function formatEventTime(e: any): string | undefined {
  // start/end 是毫秒时间戳
  const t = Number(e.start);
  if (!Number.isFinite(t) || t <= 0) return undefined;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 票牛 event.status：1/4/6 可售流转中（PC JS 里判定的白名单），其他当作不可买 */
export function normalizePiaoniuEventStatus(status: unknown): string {
  const n = Number(status);
  if (n === 1) return "ONSALE";
  if (n === 4) return "UPCOMING";
  if (n === 6) return "ONSALE";
  return "ENDED";
}

export interface PiaoniuSnapshot {
  platform: ConcertPlatform;
  key: string;
  activityId: string;
  title: string;
  city?: string;
  venue?: string;
  posterUrl?: string;
  detailUrl: string;
  sessions: any[];
  fetchedAt: number;
  source: string;
}

/** 拉整场演出 + 全部场次实时最低价 */
export async function fetchPiaoniuActivity({
  httpClient,
  activityId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<PiaoniuSnapshot> {
  if (!httpClient || typeof httpClient.get !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }
  const id = activityId != null ? String(activityId).trim() : "";
  if (!/^\d+$/.test(id)) throw withReason("invalid_args", `activityId=${activityId}`);
  const raw = await getJson(httpClient, `${API_BASE}/v1/activities/${id}`, timeoutMs);
  const snapshot = normalizePiaoniuActivity(raw, id);
  if (!snapshot.sessions.length && !snapshot.title) {
    throw withReason("parse_failed", "activity empty");
  }
  return snapshot;
}

/** 活动 JSON → 统一场次快照。title 兜底链 name→cityName→venue→未命名 */
export function normalizePiaoniuActivity(raw: any, activityId: string): PiaoniuSnapshot {
  const events = Array.isArray(raw.events) ? raw.events : [];
  const detailUrl = `https://www.piaoniu.com/activity/${activityId}`;
  const venueObj = raw.venue && typeof raw.venue === "object" ? raw.venue : {};
  return {
    platform: "piaoniu",
    key: `piaoniu:${activityId}`,
    activityId,
    title: raw.name || raw.actName || raw.cityName || venueObj.name || "未命名演出",
    city: typeof raw.cityName === "string" ? raw.cityName : undefined,
    venue: venueObj.name || undefined,
    posterUrl: typeof raw.posterUrl === "string" ? raw.posterUrl : undefined,
    detailUrl,
    sessions: normalizePiaoniuEvents(events),
    fetchedAt: Date.now(),
    source: "piaoniu-api",
  };
}

export function normalizePiaoniuEvents(arr: any[]): any[] {
  if (!Array.isArray(arr)) return [];
  const out: any[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object" || e.id == null) continue;
    out.push({
      id: String(e.id),
      name: e.specification || e.desc || formatEventTime(e) || `场次 ${e.id}`,
      time: formatEventTime(e),
      // 注意：priceLowest 是「最低价保证」布尔标志，不是价格，别参与计算
      minPrice: priceToString(e.lowPrice),
      currencySymbol: "¥",
      status: normalizePiaoniuEventStatus(e.status),
      hasTicket: Boolean(e.hasTicket),
      ticketsNumber: typeof e.ticketsNumber === "number" ? e.ticketsNumber : undefined,
    });
  }
  return out;
}

export interface PiaoniuTier {
  id: string;
  name: string;
  lowPrice?: string;
  originPrice?: string;
  ticketsNum?: number;
  hasTicket: boolean;
  /** 按购票张数的单价（/v4/tickets）；缺则仅有 lowPrice 起价 */
  qtyPrices?: PiaoniuQtyPrice[];
}

export interface PiaoniuQtyPrice {
  qty: number;
  salePrice: string;
}

/** 某场次的票档明细（卡片区「查看票档」弹层用） */
export async function fetchPiaoniuTiers({
  httpClient,
  eventId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<{ ok: true; eventId: string; tiers: PiaoniuTier[] }> {
  if (!httpClient || typeof httpClient.get !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }
  const eid = eventId != null ? String(eventId).trim() : "";
  if (!/^\d+$/.test(eid)) throw withReason("invalid_args", `eventId=${eventId}`);
  const arr = await getJson(
    httpClient,
    `${API_BASE}/v1/ticketCategories?eventId=${eid}`,
    timeoutMs,
  );
  return { ok: true as const, eventId: eid, tiers: normalizePiaoniuTiers(arr) };
}

export function normalizePiaoniuTiers(arr: any[]): PiaoniuTier[] {
  if (!Array.isArray(arr)) return [];
  const out: PiaoniuTier[] = [];
  for (const t of arr) {
    if (!t || typeof t !== "object" || t.id == null) continue;
    out.push({
      id: String(t.id),
      name: t.specification || t.desc || `档位 ${t.id}`,
      lowPrice: priceToString(t.lowPrice),
      originPrice: priceToString(t.originPrice),
      ticketsNum: typeof t.ticketsNum === "number" ? t.ticketsNum : undefined,
      hasTicket: Boolean(t.hasTicket),
    });
  }
  return out;
}

/**
 * 某票档按张数报价。ticketGroups 的 key 是张数（"1"|"2"|…），
 * 每组取第一条 ticketGroups[].salePrice 作为该张数单价（与 PC 选张逻辑一致）。
 */
export async function fetchPiaoniuQtyPrices({
  httpClient,
  eventId,
  ticketCategoryId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<{
  ok: true;
  eventId: string;
  ticketCategoryId: string;
  qtyPrices: PiaoniuQtyPrice[];
}> {
  if (!httpClient || typeof httpClient.get !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }
  const eid = eventId != null ? String(eventId).trim() : "";
  const cid = ticketCategoryId != null ? String(ticketCategoryId).trim() : "";
  if (!/^\d+$/.test(eid) || !/^\d+$/.test(cid)) {
    throw withReason("invalid_args", `eventId=${eventId} ticketCategoryId=${ticketCategoryId}`);
  }
  const raw = await getJson(
    httpClient,
    `${API_BASE}/v4/tickets?eventId=${eid}&ticketCategoryId=${cid}`,
    timeoutMs,
  );
  return {
    ok: true as const,
    eventId: eid,
    ticketCategoryId: cid,
    qtyPrices: normalizePiaoniuQtyPrices(raw && raw.ticketGroups),
  };
}

export function normalizePiaoniuQtyPrices(ticketGroups: unknown): PiaoniuQtyPrice[] {
  if (!ticketGroups || typeof ticketGroups !== "object") return [];
  const out: PiaoniuQtyPrice[] = [];
  for (const [key, group] of Object.entries(ticketGroups as Record<string, any>)) {
    const qty = Number(key);
    if (!Number.isInteger(qty) || qty <= 0) continue;
    const list = group && Array.isArray(group.ticketGroups) ? group.ticketGroups : [];
    const first = list[0];
    const salePrice = priceToString(first && first.salePrice);
    if (salePrice == null) continue;
    out.push({ qty, salePrice });
  }
  out.sort((a, b) => a.qty - b.qty);
  return out;
}

/** 取指定张数单价；无匹配则回退 lowPrice（起价，通常=1张） */
export function tierPriceForQty(tier: any, qty = 1): string | undefined {
  const q = Number(qty);
  const list = tier && Array.isArray(tier.qtyPrices) ? tier.qtyPrices : [];
  const hit = list.find((p: any) => Number(p.qty) === q);
  if (hit && hit.salePrice != null) return String(hit.salePrice);
  return tier && tier.lowPrice != null ? String(tier.lowPrice) : undefined;
}

module.exports = {
  fetchPiaoniuActivity,
  fetchPiaoniuTiers,
  fetchPiaoniuQtyPrices,
  normalizePiaoniuActivity,
  normalizePiaoniuEvents,
  normalizePiaoniuTiers,
  normalizePiaoniuQtyPrices,
  normalizePiaoniuEventStatus,
  tierPriceForQty,
};
