"use strict";

/**
 * src/main/concerts/cache.ts
 *
 * 演出票监控主进程 cache 编排。
 *   refresh()  并发拉取全部 watch 的最新快照；单个失败保留上次成功数据并打 error 标
 *   refreshOne() 新增监听后立即验证（只拉这一个，成功才保留 watch）
 *   load()     读内存 → 磁盘缓存
 *
 * 快照落盘 userData/concerts-cache.json（persist 注入），推送 concerts:updated。
 */

import * as fs from "fs";
import * as path from "path";
import { CONCERTS_CACHE_TTL_MS } from "../../shared/concerts-constants";
import {
  fetchPiaoniuActivity as defaultFetchPiaoniu,
  fetchPiaoniuTiers as defaultFetchPiaoniuTiers,
  fetchPiaoniuQtyPrices as defaultFetchPiaoniuQtyPrices,
} from "./fetcher-piaoniu";
import {
  fetchMoreticketsTour as defaultFetchMoretickets,
} from "./fetcher-moretickets";
import {
  fetchMotianlunShow as defaultFetchMotianlun,
} from "./fetcher-motianlun";

export const CACHE_TTL_MS = CONCERTS_CACHE_TTL_MS;

export function createFilePersist(filePath?: string | null) {
  return {
    read(): { payload?: any } | null {
      if (!filePath) return null;
      try {
        if (!fs.existsSync(filePath)) return null;
        const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return raw && typeof raw === "object" ? raw : null;
      } catch {
        return null;
      }
    },
    write(state: { payload: any | null }) {
      if (!filePath) return;
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(state));
      } catch {
        /* noop */
      }
    },
  };
}

function validPayload(p: any): boolean {
  return (
    !!p &&
    typeof p === "object" &&
    Array.isArray(p.watches) &&
    p.snapshots && typeof p.snapshots === "object"
  );
}

export function createConcertsCache({
  httpClient,
  getWatches,
  fetchPiaoniu = defaultFetchPiaoniu,
  fetchPiaoniuTiers = defaultFetchPiaoniuTiers,
  fetchPiaoniuQtyPrices = defaultFetchPiaoniuQtyPrices,
  fetchMoretickets = defaultFetchMoretickets,
  fetchMotianlun = defaultFetchMotianlun,
  onUpdate,
  ttlMs = CACHE_TTL_MS,
  persist,
}: any = {}): any {
  const disk = persist && typeof persist.read === "function" ? persist.read() : null;
  let cache: any = validPayload(disk && disk.payload) ? disk.payload : null;
  let inflight: any = null;

  function snapshot(): any {
    return cache ? { ...cache, watches: [...(cache.watches || [])], snapshots: { ...(cache.snapshots || {}) } } : null;
  }

  function saveDisk() {
    if (!persist || typeof persist.write !== "function") return;
    try {
      persist.write({ payload: cache });
    } catch {
      /* noop */
    }
  }

  function pushUpdate() {
    if (typeof onUpdate !== "function") return;
    try {
      onUpdate(snapshot());
    } catch {
      /* noop */
    }
  }

  /** 在售票档再拉 /v4 张数单价；缺货档跳过；单档失败不影响其它 */
  async function attachQtyPrices(eventId: string, tiers: any[]): Promise<any[]> {
    return Promise.all(
      tiers.map(async (t: any) => {
        if (!t || !t.hasTicket) return t;
        try {
          const r = await fetchPiaoniuQtyPrices({
            httpClient,
            eventId,
            ticketCategoryId: t.id,
          });
          return { ...t, qtyPrices: (r && r.qtyPrices) || [] };
        } catch {
          return t;
        }
      }),
    );
  }

  /** 票牛：活动 → 场次票档 → 在售档张数单价 */
  async function attachPiaoniuTiers(snap: any): Promise<any> {
    const sessions = Array.isArray(snap.sessions) ? snap.sessions : [];
    if (!sessions.length) return snap;
    const tiersList = await Promise.all(
      sessions.map(async (s: any) => {
        try {
          const r = await fetchPiaoniuTiers({ httpClient, eventId: s.id });
          const tiers = (r && r.tiers) || [];
          return await attachQtyPrices(s.id, tiers);
        } catch {
          return [];
        }
      }),
    );
    return {
      ...snap,
      sessions: sessions.map((s: any, i: number) => ({ ...s, tiers: tiersList[i] })),
    };
  }

  async function fetchWatch(watch: any): Promise<any> {
    if (watch.platform === "piaoniu") {
      const snap = await fetchPiaoniu({ httpClient, activityId: watch.activityId });
      snap.detailUrl = watch.url || snap.detailUrl;
      return attachPiaoniuTiers(snap);
    }
    if (watch.platform === "motianlun") {
      const pinQtys = Object.values(watch.watchedTierQty || {})
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n >= 1);
      const ticketCount = pinQtys.length
        ? Math.max(watch.ticketCount || 1, ...pinQtys)
        : watch.ticketCount || 1;
      const snap = await fetchMotianlun({
        httpClient,
        showId: watch.showId,
        sessionId: watch.sessionId,
        ticketCount,
      });
      snap.detailUrl = watch.url || snap.detailUrl;
      return snap;
    }
    const snap = await fetchMoretickets({ httpClient, tourId: watch.tourId, showId: watch.showId });
    snap.detailUrl = watch.url || snap.detailUrl;
    return snap;
  }

  /**
   * 全量刷新。永远 resolve — 单个源失败时该 key 回退上一份快照 + error 字段。
   */
  async function refresh(): Promise<any> {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const watches: any[] =
          typeof getWatches === "function" ? (getWatches() || []).filter(Boolean) : [];
        const prevSnapshots = (cache && cache.snapshots) || {};
        const results = await Promise.allSettled(watches.map((w: any) => fetchWatch(w)));
        const snapshots: Record<string, any> = {};
        watches.forEach((w: any, i: number) => {
          const r = results[i];
          if (r.status === "fulfilled" && r.value && r.value.key) {
            snapshots[w.id] = r.value;
          } else {
            const prev = prevSnapshots[w.id];
            if (prev) snapshots[w.id] = { ...prev, error: "fetch_failed", fetchedAt: prev.fetchedAt };
            else {
              const reason =
                r.status === "rejected" && r.reason && r.reason.reason
                  ? r.reason.reason
                  : "fetch_failed";
              snapshots[w.id] = emptySnapshot(w, reason);
            }
          }
        });
        cache = { watches: [...watches], snapshots, fetchedAt: Date.now(), source: "live" };
        saveDisk();
        pushUpdate();
        return snapshot();
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  /** 新增 watch 后立即验证一次：成功写入缓存并推送，失败原样抛出（caller 删 watch） */
  async function addAndFetch(watch: any): Promise<any> {
    const snap = await fetchWatch(watch);
    const watches: any[] =
      typeof getWatches === "function" ? (getWatches() || []).filter(Boolean) : [];
    const prevSnapshots = (cache && cache.snapshots) || {};
    const snapshots = {
      ...prevSnapshots,
      [watch.id]: snap,
    };
    // 补齐其它 watch 的占位（老缓存里已有则沿用）
    for (const w of watches) {
      if (!snapshots[w.id]) snapshots[w.id] = emptySnapshot(w, "pending");
    }
    cache = { watches: [...watches], snapshots, fetchedAt: Date.now(), source: "live" };
    saveDisk();
    pushUpdate();
    return snapshot();
  }

  function load(): any {
    return snapshot();
  }

  /** 钉选票档后同步 cache.watches（不重新拉价） */
  function syncWatches(): any {
    const watches: any[] =
      typeof getWatches === "function" ? (getWatches() || []).filter(Boolean) : [];
    if (!cache) {
      cache = { watches: [...watches], snapshots: {}, fetchedAt: 0, source: "cache" };
    } else {
      cache = { ...cache, watches: [...watches] };
    }
    saveDisk();
    pushUpdate();
    return snapshot();
  }

  function ttl(): number {
    return ttlMs;
  }

  function emptySnapshot(watch: any, reason: string): any {
    return {
      platform: watch.platform,
      key: watch.id,
      title: "",
      detailUrl: watch.url || "",
      sessions: [],
      fetchedAt: Date.now(),
      source: "error",
      error: reason,
    };
  }

  return { load, refresh, addAndFetch, syncWatches, ttl, emptySnapshot };
}

module.exports = { createConcertsCache, createFilePersist, CACHE_TTL_MS };
