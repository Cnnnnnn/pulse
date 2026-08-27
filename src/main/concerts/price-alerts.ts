"use strict";

/**
 * src/main/concerts/price-alerts.ts
 *
 * 演出票降价检测（纯函数）→ 系统通知文案.
 *   - 有钉选票档：只盯 watchedTierIds × watchedTierQty 单价
 *   - 无钉选：盯各场次 minPrice（整场最低在售）
 * 静默期由 sendNotification 调用方（makeWatchlistSendNotification）处理.
 */

import { tierPriceForQty } from "./fetcher-piaoniu";

export type ConcertPriceDrop = {
  watchId: string;
  title: string;
  label: string;
  before: number;
  after: number;
  detailUrl?: string;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function findTier(snap: any, tierId: string): any | null {
  for (const s of (snap && snap.sessions) || []) {
    for (const t of s.tiers || []) {
      if (t && String(t.id) === String(tierId)) return t;
    }
  }
  return null;
}

/**
 * 对比上一轮 vs 本轮快照，返回降价条目（涨价/持平忽略）.
 */
export function detectConcertPriceDrops({
  prevSnapshots,
  nextSnapshots,
  watches,
}: {
  prevSnapshots?: Record<string, any> | null;
  nextSnapshots?: Record<string, any> | null;
  watches?: any[] | null;
}): ConcertPriceDrop[] {
  const prev = prevSnapshots && typeof prevSnapshots === "object" ? prevSnapshots : {};
  const next = nextSnapshots && typeof nextSnapshots === "object" ? nextSnapshots : {};
  const list = Array.isArray(watches) ? watches : [];
  const out: ConcertPriceDrop[] = [];

  for (const w of list) {
    if (!w || !w.id) continue;
    const beforeSnap = prev[w.id];
    const afterSnap = next[w.id];
    if (!beforeSnap || !afterSnap || afterSnap.error) continue;
    const title = afterSnap.title || beforeSnap.title || w.id;
    const detailUrl = afterSnap.detailUrl || w.url;
    const pinned: string[] = Array.isArray(w.watchedTierIds) ? w.watchedTierIds : [];
    const qtyMap =
      w.watchedTierQty && typeof w.watchedTierQty === "object" ? w.watchedTierQty : {};

    if (pinned.length) {
      for (const tierId of pinned) {
        const qty = Math.max(1, Math.min(6, Number(qtyMap[tierId]) || 1));
        const tPrev = findTier(beforeSnap, tierId);
        const tNext = findTier(afterSnap, tierId);
        if (!tPrev || !tNext) continue;
        const b = num(tierPriceForQty(tPrev, qty));
        const a = num(tierPriceForQty(tNext, qty));
        if (b == null || a == null || a >= b) continue;
        out.push({
          watchId: w.id,
          title,
          label: `${tNext.name || tierId}（${qty}张）`,
          before: b,
          after: a,
          detailUrl,
        });
      }
      continue;
    }

    const prevById: Record<string, number> = {};
    for (const s of beforeSnap.sessions || []) {
      if (!s || !s.id) continue;
      const p = num(s.minPrice);
      if (p != null) prevById[s.id] = p;
    }
    for (const s of afterSnap.sessions || []) {
      if (!s || !s.id) continue;
      const a = num(s.minPrice);
      const b = prevById[s.id];
      if (a == null || b == null || a >= b) continue;
      out.push({
        watchId: w.id,
        title,
        label: s.name || `场次 ${s.id}`,
        before: b,
        after: a,
        detailUrl,
      });
    }
  }
  return out;
}

/** 一条或多条降价 → 系统通知标题/正文 */
export function formatConcertDropNotification(drops: ConcertPriceDrop[]): {
  title: string;
  body: string;
} {
  if (!drops.length) return { title: "", body: "" };
  const title = drops.length === 1 ? "演出票降价" : `演出票降价（${drops.length}）`;
  const lines = drops.slice(0, 3).map((d) => {
    const head = d.title.length > 24 ? `${d.title.slice(0, 24)}…` : d.title;
    return `${head} · ${d.label} ¥${d.before} → ¥${d.after}`;
  });
  if (drops.length > 3) lines.push(`…另有 ${drops.length - 3} 处`);
  return { title, body: lines.join("\n") };
}

module.exports = {
  detectConcertPriceDrops,
  formatConcertDropNotification,
};
