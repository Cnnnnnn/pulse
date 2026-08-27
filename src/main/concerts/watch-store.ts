"use strict";

/**
 * src/main/concerts/watch-store.ts
 *
 * 演出监听列表持久化 — 写入 state-store 的 concertWatchlist 键.
 * Mirror src/main/movies/watchlist.ts 的 DI 工厂模式（loadState/patch 可注入，
 * 测试不碰真实 state.json）。
 */

import {
  parseConcertWatchUrl,
  concertWatchKey,
  type ConcertWatchParsed,
} from "../../shared/concerts-constants";

export type ConcertWatchItem = {
  /** piaoniu:{activityId} | motianlun:{showId} | moretickets:{tourId}/{showId} */
  id: string;
  platform: "piaoniu" | "motianlun" | "moretickets";
  activityId?: string;
  showId?: string;
  sessionId?: string;
  tourId?: string;
  /** 摩天轮国内：默认购票张数（来自 URL ticketCount） */
  ticketCount?: number;
  url: string;
  createdAt: number;
  /** 票牛 / 摩天轮国内：钉选盯价的票档 id */
  watchedTierIds?: string[];
  /** 钉选档的购票张数（默认 1）；key = tierId */
  watchedTierQty?: Record<string, number>;
};

export function createConcertWatchlist({
  loadState,
  patch,
  now = Date.now,
}: {
  loadState?: () => any;
  patch: (updater: (state: any) => void) => unknown;
  now?: () => number;
}) {
  function list(): ConcertWatchItem[] {
    const value = loadState && loadState()?.concertWatchlist;
    return Array.isArray(value) ? value.filter(isConcertWatchItem) : [];
  }

  function add(input: { url: unknown }): { ok: true; item: ConcertWatchItem; added: boolean } | { ok: false; reason: string } {
    const parsed = parseConcertWatchUrl(input && input.url);
    if (!parsed) return { ok: false, reason: "invalid_url" };
    const id = concertWatchKey(parsed);
    let created: ConcertWatchItem | undefined;
    patch((state: any) => {
      const entries = Array.isArray(state.concertWatchlist)
        ? state.concertWatchlist.filter(isConcertWatchItem)
        : [];
      if (entries.some((e: any) => e.id === id)) return;
      created = normalizeItem(parsed, input.url as string, now());
      entries.push(created);
      state.concertWatchlist = entries;
    });
    if (!created) {
      const existing = list().find((e: any) => e.id === id);
      return existing
        ? { ok: true as const, item: existing, added: false }
        : { ok: false as const, reason: "unknown" };
    }
    return { ok: true as const, item: created, added: true };
  }

  function remove(id: string): { ok: boolean; reason?: string } {
    if (!id || typeof id !== "string") return { ok: false, reason: "invalid_args" };
    patch((state: any) => {
      const entries = Array.isArray(state.concertWatchlist)
        ? state.concertWatchlist.filter(isConcertWatchItem)
        : [];
      const next = entries.filter((e: any) => e.id !== id);
      if (next.length === entries.length) return;
      state.concertWatchlist = next;
    });
    return { ok: !list().some((e: any) => e.id === id) };
  }

  function setWatchedTiers(
    watchId: string,
    tierIds: unknown,
    tierQty?: unknown,
  ): { ok: true; item: ConcertWatchItem } | { ok: false; reason: string } {
    if (!watchId || typeof watchId !== "string") return { ok: false, reason: "invalid_args" };
    const ids = Array.isArray(tierIds)
      ? [...new Set(tierIds.map((t) => String(t).trim()).filter((t) => /^[a-zA-Z0-9]+$/.test(t)))]
      : null;
    if (!ids) return { ok: false, reason: "invalid_args" };
    const qtyMap = sanitizeTierQty(tierQty, ids);
    let updated: ConcertWatchItem | undefined;
    patch((state: any) => {
      const entries = Array.isArray(state.concertWatchlist)
        ? state.concertWatchlist.filter(isConcertWatchItem)
        : [];
      const idx = entries.findIndex((e: any) => e.id === watchId);
      if (idx < 0) return;
      const next = { ...entries[idx] };
      if (ids.length) {
        next.watchedTierIds = ids;
        if (qtyMap && Object.keys(qtyMap).length) next.watchedTierQty = qtyMap;
        else delete next.watchedTierQty;
      } else {
        delete next.watchedTierIds;
        delete next.watchedTierQty;
      }
      entries[idx] = next;
      state.concertWatchlist = entries;
      updated = next;
    });
    return updated
      ? { ok: true as const, item: updated }
      : { ok: false as const, reason: "not_found" };
  }

  return { list, add, remove, setWatchedTiers };
}

function sanitizeTierQty(raw: unknown, ids: string[]): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const idSet = new Set(ids);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!idSet.has(k)) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 10) continue;
    out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function isConcertWatchItem(v: any): v is ConcertWatchItem {
  return (
    !!v &&
    typeof v === "object" &&
    typeof v.id === "string" &&
    (v.platform === "piaoniu" || v.platform === "motianlun" || v.platform === "moretickets")
  );
}

function normalizeItem(parsed: ConcertWatchParsed, url: string, ts: number): ConcertWatchItem {
  switch (parsed.platform) {
    case "piaoniu":
      return {
        id: `piaoniu:${parsed.activityId}`,
        platform: "piaoniu",
        activityId: parsed.activityId,
        url,
        createdAt: ts,
      };
    case "motianlun":
      return {
        id: `motianlun:${parsed.showId}`,
        platform: "motianlun",
        showId: parsed.showId,
        sessionId: parsed.sessionId,
        ticketCount: parsed.ticketCount,
        url,
        createdAt: ts,
      };
    case "moretickets":
      return {
        id: `moretickets:${parsed.tourId}/${parsed.showId}`,
        platform: "moretickets",
        tourId: parsed.tourId,
        showId: parsed.showId,
        url,
        createdAt: ts,
      };
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

module.exports = { createConcertWatchlist };
