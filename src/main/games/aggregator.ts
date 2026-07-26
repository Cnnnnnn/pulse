/**
 * src/main/games/aggregator.ts
 *
 * 聚合层 — 对外唯一入口 getGameDeals()。
 */
"use strict";

import { PLATFORM_KEYS } from "./normalize";
import { fetchSteamDeals } from "./steam";
import { fetchSteamFree } from "./steam-free";
import { fetchEpicDeals, fetchEpicFree } from "./epic";
import { fetchXboxFree } from "./xbox-free";
import { fetchItadDeals } from "./itad";
import { fetchSwitchDeals } from "./switch";
import { fetchPlayStationDeals as fetchPsMain } from "./playstation";
import { fetchPlayStationDeals as fetchPsPsprices } from "./psprices";
import { getSampleDeals } from "./sample";
import { logFetchError } from "./log";

const CONSOLE_PLATFORMS = ["xbox", "playstation", "switch"];

export async function fetchPlatform(platform: string, { mode, sort, minSavings, country, itadKey }: any): Promise<any> {
  try {
    if (platform === "steam") {
      const items = mode === "free"
        ? await fetchSteamFree()
        : await fetchSteamDeals({ sort, pageSize: 40, minSavings });
      return { items, source: "live" };
    }
    if (platform === "epic") {
      const items = mode === "free"
        ? await fetchEpicFree({ country })
        : await fetchEpicDeals({ sort, pageSize: 40, minSavings });
      return { items, source: "live" };
    }
    if (platform === "xbox" && mode === "free") {
      const items = await fetchXboxFree({ market: "US", language: "en-US" });
      return { items, source: "live" };
    }
    if (mode === "free" && (platform === "playstation" || platform === "switch")) {
      return { items: [], source: "live" };
    }
    if (platform === "switch") {
      const live = await fetchSwitchDeals({ limit: 40, country, mode });
      if (live && live.length > 0) return { items: live, source: "live" };
      return { items: getSampleDeals("switch"), source: "sample" };
    }
    if (platform === "playstation") {
      const main = await fetchPsMain({ limit: 40, region: "us", mode });
      if (main && main.length > 0) {
        return { items: main, source: "live", psDriver: "psgamespider" };
      }
      const psLive = await fetchPsPsprices({
        limit: 40,
        region: "us",
        mode,
      });
      if (psLive && psLive.length > 0) {
        return { items: psLive, source: "live", psDriver: "psprices" };
      }
      return {
        items: getSampleDeals("playstation"),
        source: "sample",
        psDriver: null,
      };
    }
    const live = await fetchItadDeals(platform, {
      key: itadKey,
      country,
      limit: 40,
    });
    if (live && live.length > 0) return { items: live, source: "live" };
    return { items: getSampleDeals(platform), source: "sample" };
  } catch (err: any) {
    logFetchError(`aggregator:${platform}`, err);
    if (mode === "free") return { items: [], source: "live" };
    if (CONSOLE_PLATFORMS.includes(platform)) {
      return { items: getSampleDeals(platform), source: "sample" };
    }
    return { items: [], source: "live" };
  }
}

export function sortDeals(items: any[], sort: string): any[] {
  const arr = items.slice();
  if (sort === "price") {
    arr.sort((a: any, b: any) => (a.salePrice ?? Infinity) - (b.salePrice ?? Infinity));
  } else if (sort === "rating") {
    arr.sort((a: any, b: any) => (b.rating ?? -1) - (a.rating ?? -1));
  } else {
    arr.sort((a: any, b: any) => b.savings - a.savings);
  }
  return arr;
}

function normalizeTitle(t: string): string {
  return String(t || "")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[:：\-—–_·,.()（）#!?？]/g, " ")
    .replace(/\b(deluxe|premium|ultimate|goty|standard|complete|edition|version|版|豪华版|年度版)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function betterDeal(a: any, b: any): boolean {
  if (a.savings !== b.savings) return a.savings > b.savings;
  const pa = a.salePrice ?? Infinity;
  const pb = b.salePrice ?? Infinity;
  if (pa !== pb) return pa < pb;
  return false;
}

export async function getGameDeals(opts: any = {}): Promise<any> {
  const {
    platform = "all",
    mode = "deals",
    sort = "savings",
    minSavings = 0,
    country = "CN",
    itadKey = null,
  } = opts;

  const platforms =
    platform === "all" ? PLATFORM_KEYS.slice() : [platform].filter((p: any) => PLATFORM_KEYS.includes(p));

  const results = await Promise.all(
    platforms.map((p: string) =>
      fetchPlatform(p, { mode, sort, minSavings, country, itadKey }).then(
        (r: any) => [p, r],
      ),
    ),
  );

  const sources: Record<string, string> = {};
  let psDriver: string | null = null;
  let items: any[] = [];
  for (const [p, r] of results) {
    sources[p] = r.source;
    if (p === "playstation") psDriver = r.psDriver || null;
    items = items.concat(r.items);
  }

  const seenId = new Set<string>();
  let deduped = items.filter((it: any) => {
    if (seenId.has(it.id)) return false;
    seenId.add(it.id);
    return true;
  });

  if (mode === "deals") {
    deduped = deduped.filter((it: any) => !it.isFree);
  }

  if (mode === "free" || mode === "compare") {
    items = deduped;
  } else {
    const byTitle = new Map<string, any>();
    for (const it of deduped) {
      const key = normalizeTitle(it.title);
      const prev = byTitle.get(key);
      if (!prev || betterDeal(it, prev)) byTitle.set(key, it);
    }
    items = [...byTitle.values()];
  }

  if (mode === "free") {
    items = items
      .filter((it: any) => it.isFree)
      .sort((a: any, b: any) => {
        const parsedAEnd = a.freeUntil ? Date.parse(a.freeUntil) : NaN;
        const parsedBEnd = b.freeUntil ? Date.parse(b.freeUntil) : NaN;
        const aEnd = Number.isFinite(parsedAEnd) ? parsedAEnd : Infinity;
        const bEnd = Number.isFinite(parsedBEnd) ? parsedBEnd : Infinity;
        return aEnd - bEnd;
      });
  } else if (mode === "compare") {
    items = items
      .filter((it: any) => !it.isFree)
      .sort((a: any, b: any) => {
        const ta = normalizeTitle(a.title);
        const tb = normalizeTitle(b.title);
        if (ta !== tb) return ta < tb ? -1 : 1;
        return (a.salePrice ?? Infinity) - (b.salePrice ?? Infinity);
      });
  }

  return {
    ok: true,
    platform,
    mode,
    items,
    sources,
    psDriver,
    count: items.length,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getGameDeals, sortDeals };
