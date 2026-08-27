"use strict";

/**
 * src/main/concerts/fetcher-motianlun.ts
 *
 * 摩天轮国内站 fetcher（m.motianlun.cn / tking showapi）.
 *   GET  /showapi/pub/show/{showId}                              → 演出标题/场馆/整场最低价
 *   GET  /showapi/transfer/show/{showId}/session                  → 场次列表（详情页无 sessionId 时用）
 *   GET  /showapi/transfer/show/session/{sessionId}/seatPlan     → 票档名 + 面值
 *   POST /showapi/pub/show_session/v2/find_tickets               → 按张数/连座的真实在售价
 *
 * 注意：v2/find_seat_plans 只回 token，不含价；在售价必须走 find_tickets。
 * 与国际站 moretickets.com（api-global）是两套后端。
 */

import type { ConcertPlatform } from "../../shared/concerts-constants";

const API_BASE = "https://m.motianlun.cn";
const DEFAULT_TIMEOUT_MS = 10000;
const TICKET_PAGE_SIZE = 20;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "application/json",
  Referer: "https://m.motianlun.cn/",
  Origin: "https://m.motianlun.cn",
  src: "m_web",
  platform: "H5",
  channel: "m_web",
  "Content-Type": "application/json",
};

function withReason(reason: string, msg: string): Error {
  const err: any = new Error(`concerts: motianlun ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

function priceToString(v: unknown): string | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return String(Math.round(n * 100) / 100);
}

async function parseJsonResponse(res: any): Promise<any> {
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
  if (raw.statusCode != null && raw.statusCode !== 200) {
    throw withReason(
      "fetch_failed",
      `statusCode=${raw.statusCode} ${raw.comments || ""}`.trim(),
    );
  }
  return raw;
}

function sessionStatusFromShow(show: any): string {
  const st = show && show.showStatus;
  const name = st && typeof st.name === "string" ? st.name.toUpperCase() : "";
  if (name === "ONSALE") return "ONSALE";
  if (name === "SOLDOUT") return "SOLDOUT";
  if (name === "PENDING" || name === "UPCOMING" || name === "PRESALE") return "UPCOMING";
  return name || "ENDED";
}

export interface MotianlunSnapshot {
  platform: ConcertPlatform;
  key: string;
  showId: string;
  sessionId?: string;
  title: string;
  city?: string;
  venue?: string;
  posterUrl?: string;
  detailUrl: string;
  sessions: any[];
  fetchedAt: number;
  source: string;
}

/** 拉演出详情 + 场次在售价（无 sessionId 时展开全部场次） */
export async function fetchMotianlunShow({
  httpClient,
  showId,
  sessionId,
  ticketCount = 1,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<MotianlunSnapshot> {
  if (!httpClient || typeof httpClient.get !== "function" || typeof httpClient.post !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }
  const sid = showId != null ? String(showId).trim() : "";
  if (!/^[a-zA-Z0-9]+$/.test(sid)) {
    throw withReason("invalid_args", `showId=${showId}`);
  }
  const preferSession =
    sessionId != null && String(sessionId).trim()
      ? String(sessionId).trim()
      : "";
  if (preferSession && !/^[a-zA-Z0-9]+$/.test(preferSession)) {
    throw withReason("invalid_args", `sessionId=${sessionId}`);
  }
  const qty = Math.max(1, Math.min(10, Number(ticketCount) || 1));

  const showRes: any = await httpClient.get(`${API_BASE}/showapi/pub/show/${sid}`, {
    timeout: timeoutMs,
    headers: HEADERS,
  });
  const showRaw = await parseJsonResponse(showRes);
  const show = (showRaw.result && showRaw.result.data) || showRaw.data || {};

  const sessionMeta = await listSessions(httpClient, sid, timeoutMs);
  const targets =
    sessionMeta.length > 0
      ? sessionMeta
      : preferSession
        ? [{ id: preferSession, name: undefined }]
        : [];
  if (!targets.length) {
    throw withReason("fetch_failed", "no sessions");
  }

  const sessions = await Promise.all(
    targets.map(async (meta) => {
      const seatPlans = await fetchSeatPlans(httpClient, meta.id, qty, timeoutMs);
      const planIds = seatPlans
        .map((p: any) => (p && p.seatPlanOID != null ? String(p.seatPlanOID) : ""))
        .filter(Boolean);
      const ticketMins = await fetchTicketMins(httpClient, meta.id, planIds, qty, timeoutMs);
      return buildSession(show, seatPlans, ticketMins, meta, qty);
    }),
  );

  return {
    platform: "motianlun",
    key: `motianlun:${sid}`,
    showId: sid,
    sessionId: preferSession || undefined,
    title: (show && (show.originalShowName || show.showName)) || "未命名演出",
    city: show && typeof show.cityName === "string" ? show.cityName : undefined,
    venue: show && typeof show.venueName === "string" ? show.venueName : undefined,
    posterUrl: show && typeof show.posterURL === "string" ? show.posterURL : undefined,
    detailUrl: `https://m.motianlun.cn/pages/show-detail/show-detail?showId=${sid}`,
    sessions,
    fetchedAt: Date.now(),
    source: "motianlun-api",
  };
}

async function listSessions(
  httpClient: any,
  showId: string,
  timeoutMs: number,
): Promise<Array<{ id: string; name?: string }>> {
  try {
    const res: any = await httpClient.get(
      `${API_BASE}/showapi/transfer/show/${showId}/session`,
      { timeout: timeoutMs, headers: HEADERS },
    );
    const raw = await parseJsonResponse(res);
    const list = (raw.result && raw.result.data) || raw.data || [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((s: any) => s && s.showSessionOID != null)
      .map((s: any) => ({
        id: String(s.showSessionOID),
        name:
          (typeof s.sessionName === "string" && s.sessionName) ||
          (typeof s.showTime_weekday === "string" && s.showTime_weekday) ||
          (typeof s.showTime === "string" && s.showTime) ||
          undefined,
      }));
  } catch {
    return [];
  }
}

async function fetchSeatPlans(
  httpClient: any,
  sessionId: string,
  qty: number,
  timeoutMs: number,
): Promise<any[]> {
  try {
    const plansRes: any = await httpClient.get(
      `${API_BASE}/showapi/transfer/show/session/${sessionId}/seatPlan?ticketCount=${qty}&adjacentSeat=true`,
      { timeout: timeoutMs, headers: HEADERS },
    );
    const plansRaw = await parseJsonResponse(plansRes);
    const list = (plansRaw.result && plansRaw.result.data) || plansRaw.data || [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * 按票档分别查在售最低价。
 * 源站 find_tickets 不带 seatPlanId 时只回最便宜/最贵的一页（且 total 常为 0、无法翻页），
 * 必须按 seatPlanId 补齐；并行易触发 556，故串行 + 一次重试。
 */
async function fetchTicketMins(
  httpClient: any,
  sessionId: string,
  seatPlanIds: string[],
  ticketNumber: number,
  timeoutMs: number,
): Promise<Record<string, number>> {
  const mins: Record<string, number> = {};
  const merge = (part: Record<string, number>) => {
    for (const [id, price] of Object.entries(part)) {
      if (mins[id] == null || price < mins[id]) mins[id] = price;
    }
  };

  // 先 ASC/DESC 各一页，覆盖两端价位
  for (const sort of ["TICKET_PRICE_ASC", "TICKET_PRICE_DESC"] as const) {
    try {
      merge(
        aggregateTicketMins(
          await fetchTicketsPage(httpClient, sessionId, ticketNumber, timeoutMs, null, sort),
        ),
      );
    } catch {
      /* 单页失败不阻断 */
    }
  }

  const ids = [...new Set(seatPlanIds.filter(Boolean))];
  for (const seatPlanId of ids) {
    if (mins[seatPlanId] != null) continue;
    let got = false;
    for (let attempt = 0; attempt < 2 && !got; attempt++) {
      if (attempt > 0) await sleep(280);
      try {
        merge(
          aggregateTicketMins(
            await fetchTicketsPage(
              httpClient,
              sessionId,
              ticketNumber,
              timeoutMs,
              seatPlanId,
              "TICKET_PRICE_ASC",
            ),
          ),
        );
        got = true;
      } catch {
        /* 重试或放弃 → 该档保持缺货 */
      }
    }
  }

  // 无票档列表时至少保留 ASC/DESC 结果；若也空再兜底一页
  if (!ids.length && !Object.keys(mins).length) {
    try {
      merge(
        aggregateTicketMins(
          await fetchTicketsPage(
            httpClient,
            sessionId,
            ticketNumber,
            timeoutMs,
            null,
            "TICKET_PRICE_ASC",
          ),
        ),
      );
    } catch {
      return {};
    }
  }
  return mins;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTicketsPage(
  httpClient: any,
  sessionId: string,
  ticketNumber: number,
  timeoutMs: number,
  seatPlanId: string | null,
  ticketSortType: string,
): Promise<any[]> {
  const body: any = {
    showSessionId: sessionId,
    ticketNumber,
    ticketSortType,
    offset: 0,
    length: TICKET_PAGE_SIZE,
  };
  if (ticketNumber > 1) body.adjacentSeat = true;
  if (seatPlanId) body.seatPlanId = seatPlanId;
  const res: any = await httpClient.post(
    `${API_BASE}/showapi/pub/show_session/v2/find_tickets`,
    body,
    HEADERS,
    { timeout: timeoutMs },
  );
  const raw = await parseJsonResponse(res);
  const data = raw.data || {};
  return Array.isArray(data.sessionTicketList) ? data.sessionTicketList : [];
}

/** 按 seatPlanId 聚合最低在售价 */
export function aggregateTicketMins(tickets: any[]): Record<string, number> {
  const mins: Record<string, number> = {};
  for (const t of tickets || []) {
    if (!t || t.seatPlanId == null || t.price == null) continue;
    const id = String(t.seatPlanId);
    const p = Number(t.price);
    if (!Number.isFinite(p) || p <= 0) continue;
    if (mins[id] == null || p < mins[id]) mins[id] = p;
  }
  return mins;
}

export function normalizeMotianlunTiers(
  seatPlans: any[],
  ticketMins: Record<string, number>,
  ticketCount: number,
): any[] {
  const plans = Array.isArray(seatPlans) ? seatPlans : [];
  const seen = new Set<string>();
  const out: any[] = [];

  for (const p of plans) {
    if (!p || p.seatPlanOID == null) continue;
    const id = String(p.seatPlanOID);
    seen.add(id);
    const low = ticketMins[id];
    const hasTicket = low != null;
    const lowStr = priceToString(low);
    out.push({
      id,
      name:
        (p.comments && p.originalPrice != null
          ? `${p.comments}${p.originalPrice}元`
          : null) ||
        p.seatPlanName ||
        p.comments ||
        `档位 ${id.slice(-6)}`,
      lowPrice: lowStr,
      originPrice: priceToString(p.originalPrice),
      hasTicket,
      ticketsNum: hasTicket ? undefined : 0,
      qtyPrices: lowStr != null ? [{ qty: ticketCount, salePrice: lowStr }] : undefined,
    });
  }

  // 无票档面值列表时，才把票列表里的未知档兜底输出（避免脏 id）
  if (!plans.length) {
    for (const [id, low] of Object.entries(ticketMins)) {
      if (seen.has(id)) continue;
      const lowStr = priceToString(low);
      out.push({
        id,
        name: `档位 ${id.slice(-6)}`,
        lowPrice: lowStr,
        hasTicket: true,
        qtyPrices: lowStr != null ? [{ qty: ticketCount, salePrice: lowStr }] : undefined,
      });
    }
  }
  return out;
}

function buildSession(
  show: any,
  seatPlans: any[],
  ticketMins: Record<string, number>,
  meta: { id: string; name?: string },
  ticketCount: number,
): any {
  const tiers = normalizeMotianlunTiers(seatPlans, ticketMins, ticketCount);
  const priced = Object.values(ticketMins);
  const sessionMin =
    priced.length > 0
      ? String(Math.min(...priced))
      : priceToString(show && show.minPrice);
  const sessionName =
    meta.name ||
    (show && (show.showDate || show.latestShowTime_weekday || show.sessionName)) ||
    `场次 ${meta.id.slice(-6)}`;

  return {
    id: meta.id,
    name: sessionName,
    minPrice: sessionMin,
    currencySymbol: "¥",
    status: sessionStatusFromShow(show),
    hasTicket: priced.length > 0 || tiers.some((t) => t.hasTicket),
    ticketCount,
    tiers,
  };
}

/** 单场次归一（测试 / 兼容） */
export function normalizeMotianlunShow(
  show: any,
  seatPlans: any[],
  tickets: any[],
  showId: string,
  sessionId: string,
  ticketCount = 1,
): MotianlunSnapshot {
  const session = buildSession(
    show,
    seatPlans,
    aggregateTicketMins(tickets),
    { id: sessionId },
    ticketCount,
  );
  return {
    platform: "motianlun",
    key: `motianlun:${showId}`,
    showId,
    sessionId,
    title: (show && (show.originalShowName || show.showName)) || "未命名演出",
    city: show && typeof show.cityName === "string" ? show.cityName : undefined,
    venue: show && typeof show.venueName === "string" ? show.venueName : undefined,
    posterUrl: show && typeof show.posterURL === "string" ? show.posterURL : undefined,
    detailUrl: `https://m.motianlun.cn/pages/show-detail/show-detail?showId=${showId}`,
    sessions: [session],
    fetchedAt: Date.now(),
    source: "motianlun-api",
  };
}

module.exports = {
  fetchMotianlunShow,
  normalizeMotianlunShow,
  normalizeMotianlunTiers,
  aggregateTicketMins,
};
