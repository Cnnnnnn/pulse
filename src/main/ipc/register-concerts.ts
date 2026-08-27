"use strict";

/**
 * src/main/ipc/register-concerts.ts
 *
 * 演出票监控模块唯一 electron 边界. 通过 ctx.safeHandle 注册 channel:
 *   concerts:load / refresh / add / remove / tiers / setWatchedTiers
 *
 * 降价通知：refresh 前后对比快照 → Electron Notification（尊重静默时段）.
 * 后台轮询：有监听时每 CONCERTS_CACHE_TTL_MS（2min）自动 refresh，否则收不到「一旦降价」.
 */

import type {} from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";
import * as path from "path";
import { CONCERTS_CACHE_TTL_MS } from "../../shared/concerts-constants";
import { fetchPiaoniuActivity, fetchPiaoniuTiers } from "../concerts/fetcher-piaoniu";
import { fetchMoreticketsTour } from "../concerts/fetcher-moretickets";
import { fetchMotianlunShow } from "../concerts/fetcher-motianlun";
import { createConcertsCache, createFilePersist } from "../concerts/cache";
import { createConcertWatchlist } from "../concerts/watch-store";
import {
  detectConcertPriceDrops,
  formatConcertDropNotification,
} from "../concerts/price-alerts";
import { load as loadState, patchState } from "../state-store.js";
import { HttpClient } from "../http-client";
import { mainLog } from "../log";
import { setManagedInterval } from "../timer-registry";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function concertsCacheFile(): string | null {
  try {
    const electron = require("electron");
    const app = electron && electron.app;
    const base = app && typeof app.getPath === "function" ? app.getPath("userData") : null;
    return base ? path.join(base, "concerts-cache.json") : null;
  } catch {
    return null;
  }
}

export const UPDATED_CHANNEL = "concerts:updated";
const TIMEOUT_MS = 10000;

export function registerConcertsHandlers(ctx: any) {
  const { safeHandle, sendToRenderer, getConfig } = ctx;
  if (typeof safeHandle !== "function") return;

  const httpClient = new HttpClient({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const watchlist = createConcertWatchlist({ loadState, patch: patchState });

  const cache = createConcertsCache({
    httpClient,
    getWatches: () => watchlist.list(),
    fetchPiaoniu: (args: any) => fetchPiaoniuActivity(args),
    fetchMoretickets: (args: any) => fetchMoreticketsTour(args),
    fetchMotianlun: (args: any) => fetchMotianlunShow(args),
    persist: createFilePersist(concertsCacheFile()),
    onUpdate: (payload: IpcChannelMap["concerts:load"]["result"]) => {
      if (typeof sendToRenderer === "function") {
        try {
          sendToRenderer(UPDATED_CHANNEL, payload);
        } catch {
          /* noop */
        }
      }
    },
  });

  function notifyPriceDrops(prevPayload: any, nextPayload: any) {
    try {
      const drops = detectConcertPriceDrops({
        prevSnapshots: prevPayload && prevPayload.snapshots,
        nextSnapshots: nextPayload && nextPayload.snapshots,
        watches: (nextPayload && nextPayload.watches) || watchlist.list(),
      });
      if (!drops.length) return;
      const { makeWatchlistSendNotification } = require("../watchlist.ts");
      const send = makeWatchlistSendNotification(getConfig);
      const msg = formatConcertDropNotification(drops);
      if (msg.title) send(msg);
    } catch (err: any) {
      mainLog.warn(`[ipc] concerts:price-alert failed: ${errMsg(err)}`);
    }
  }

  /** 带降价检测的 refresh（手动 + 后台共用） */
  async function refreshAndAlert(): Promise<IpcChannelMap["concerts:refresh"]["result"]> {
    const prev = cache.load();
    const next = await cache.refresh();
    notifyPriceDrops(prev, next);
    return next;
  }

  // 有监听时每 2 分钟后台拉一次，才谈得上「一旦降价就通知」
  setManagedInterval(() => {
    if (!watchlist.list().length) return;
    refreshAndAlert().catch((err: any) => {
      mainLog.warn(`[ipc] concerts:poll failed: ${errMsg(err)}`);
    });
  }, CONCERTS_CACHE_TTL_MS);

  safeHandle("concerts:load", (): IpcChannelMap["concerts:load"]["result"] => cache.load());

  safeHandle(
    "concerts:refresh",
    async (): Promise<IpcChannelMap["concerts:refresh"]["result"]> => {
      try {
        return await refreshAndAlert();
      } catch (err: any) {
        mainLog.warn(`[ipc] concerts:refresh failed: ${errMsg(err)}`);
        return {
          watches: watchlist.list(),
          snapshots: {},
          fetchedAt: Date.now(),
          source: "error",
        };
      }
    },
  );

  safeHandle(
    "concerts:add",
    async (_evt: unknown, input: { url?: string }): Promise<any> => {
      const url = input && input.url;
      const result = watchlist.add({ url });
      if (!result.ok) return result;
      if (!result.added) {
        try {
          const payload = await refreshAndAlert();
          return { ok: true as const, added: false, item: result.item, payload };
        } catch (err: any) {
          mainLog.warn(`[ipc] concerts:add refresh failed: ${errMsg(err)}`);
          return { ok: true as const, added: false, item: result.item };
        }
      }
      try {
        // 首次验证不走降价检测（无有意义 prev）
        const payload = await cache.addAndFetch(result.item);
        return { ok: true as const, added: true, item: result.item, payload };
      } catch (err: any) {
        watchlist.remove(result.item.id);
        const reason =
          err && typeof err === "object" && "reason" in err ? (err as any).reason : "threw";
        mainLog.warn(`[ipc] concerts:add verify failed: id=${result.item.id}, reason=${reason}`);
        return { ok: false as const, reason };
      }
    },
  );

  safeHandle("concerts:remove", (_evt: unknown, id: string): any => {
    const r = watchlist.remove(id);
    if (!r.ok) return r;
    return { ok: true as const, payload: cache.syncWatches() };
  });

  safeHandle(
    "concerts:setWatchedTiers",
    (_evt: unknown, input: { watchId?: string; tierIds?: string[]; tierQty?: Record<string, number> }): any => {
      const watchId = input && input.watchId;
      const tierIds = input && input.tierIds;
      if (!watchId) return { ok: false as const, reason: "invalid_args" };
      const r = watchlist.setWatchedTiers(watchId, tierIds, input && input.tierQty);
      if (!r.ok) return r;
      return { ok: true as const, item: r.item, payload: cache.syncWatches() };
    },
  );

  safeHandle(
    "concerts:tiers",
    async (
      _evt: unknown,
      input: { eventId?: string | number },
    ): Promise<IpcChannelMap["concerts:tiers"]["result"]> => {
      const eventId = input && input.eventId;
      try {
        return await fetchPiaoniuTiers({ httpClient, eventId, timeoutMs: TIMEOUT_MS });
      } catch (err: any) {
        const reason =
          err && typeof err === "object" && "reason" in err ? (err as any).reason : "threw";
        mainLog.warn(`[ipc] concerts:tiers failed: event=${eventId}, reason=${reason}`);
        return { ok: false as const, reason };
      }
    },
  );
}

module.exports = { registerConcertsHandlers, UPDATED_CHANNEL };
