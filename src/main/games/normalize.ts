/**
 * src/main/games/normalize.ts
 *
 * 游戏优惠数据 — 规范化层。
 * 把各平台原始返回统一成内部 GameDeal 形状，renderer 只认这一种结构。
 */
"use strict";

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  steam: { label: "Steam", color: "#1b2838" },
  epic: { label: "Epic", color: "#2a2a2a" },
  xbox: { label: "Xbox", color: "#107c10" },
  playstation: { label: "PlayStation", color: "#003791" },
  switch: { label: "Switch", color: "#e60012" },
};

export const PLATFORM_KEYS = Object.keys(PLATFORM_META);

// 2026-07-26: BROWSER_UA / BROWSER_UA_SAFARI 改为从 src/utils/http-constants.ts 复用 (canonical).
//   games/normalize.ts 这里 re-export 维持向后兼容 (game fetcher 已有 import 不破坏).
import { BROWSER_UA, BROWSER_UA_SAFARI } from "../../utils/http-constants";
export { BROWSER_UA, BROWSER_UA_SAFARI };

const PROMOTION_TYPES = new Set([
  "giveaway",
  "key",
  "free-weekend",
  "free-play-days",
]);

export function toGameDeal(raw: any): any {
  const platform = PLATFORM_KEYS.includes(raw.platform) ? raw.platform : "steam";
  const salePrice =
    raw.salePrice == null ? null : Number(raw.salePrice);
  const normalPrice =
    raw.normalPrice == null ? null : Number(raw.normalPrice);
  let savings = raw.savings == null ? 0 : Math.round(Number(raw.savings));
  if (savings < 0) savings = 0;
  if (savings > 100) savings = 100;
  const isFree =
    Boolean(raw.isFree) ||
    (salePrice === 0 && normalPrice != null && normalPrice > 0);
  return {
    id: String(raw.id != null ? raw.id : `${platform}-${raw.title || Math.random()}`),
    platform,
    title: String(raw.title || "未知游戏"),
    thumb: raw.thumb || null,
    salePrice,
    normalPrice,
    savings,
    currency: raw.currency || "USD",
    dealUrl: raw.dealUrl || null,
    isFree,
    freeUntil: raw.freeUntil || null,
    rating: raw.rating == null ? null : Math.round(Number(raw.rating)),
    releaseDate: raw.releaseDate || null,
    store: raw.store || PLATFORM_META[platform].label,
    source: raw.source === "live" ? "live" : "sample",
    popular: raw.popular == null ? 0 : Number(raw.popular),
    lowestPrice:
      raw.lowestPrice != null && Number.isFinite(Number(raw.lowestPrice))
        ? Number(raw.lowestPrice)
        : null,
    promotionType: PROMOTION_TYPES.has(raw.promotionType)
      ? raw.promotionType
      : null,
    requirements:
      typeof raw.requirements === "string" && raw.requirements.trim()
        ? raw.requirements.trim()
        : null,
    provider:
      typeof raw.provider === "string" && raw.provider.trim()
        ? raw.provider.trim()
        : null,
  };
}

export async function fetchJson(url: string, { timeoutMs = 8000, headers = {} }: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// 2026-07-26: 抽出 fetchText. playstation.ts + xbox-free.ts 两份本地实现合并,
// 差异只在 Accept header (caller 通过 headers 传入). 默认 UA 走 BROWSER_UA.
export async function fetchText(
  url: string,
  { timeoutMs = 9000, headers = {} }: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  PLATFORM_META,
  PLATFORM_KEYS,
  BROWSER_UA,
  BROWSER_UA_SAFARI,
  toGameDeal,
  fetchJson,
  fetchText,
};
