/**
 * src/main/finance/news-store.ts
 *
 * 财经新闻本地数据模型 — finance_news.json（独立落盘，见 finance-files）。
 * 形状：ts / articles / favorites（articles 含财经专有字段 category/tags/popularity/isRed）。
 * summaries / dayStats / categories 为死字段，已于 P3-A3 移除。
 *
 * 国家统计局 RSS 节流：仅当已有 stats 文章超过 6h（或 force）才重新拉取，
 * 否则复用既有 stats 文章（refresh 时保留在 articles 中）。
 */

import { aggregateNews } from "./aggregator";
import {
  FIN_ARTICLES_PER_DAY,
  FIN_ARTICLES_TOTAL_CAP,
  STATS_CACHE_TTL_MS,
  FIN_CATEGORIES,
} from "./config";
import {
  readNewsState,
  writeNewsState,
} from "./finance-files";
import type { FinArticle } from "../../shared/finance-types";

function _emptyState(): any {
  return {
    ts: 0,
    articles: {},
    favorites: {},
  };
}

function _normalizeState(raw: any): any {
  if (!raw || typeof raw !== "object") return _emptyState();
  return {
    ts: typeof raw.ts === "number" ? raw.ts : 0,
    articles:
      raw.articles && typeof raw.articles === "object" ? raw.articles : {},
    favorites:
      raw.favorites && typeof raw.favorites === "object" ? raw.favorites : {},
  };
}

/**
 * E2：各分类文章计数（含「全部」），用于分类 tab 旁展示数量。
 * 基于全量 articles 统计，不随当前分类/搜索过滤变化。
 */
export function getCategoryCounts(statePath?: any): Record<string, number> {
  const state = _normalizeState(readNewsState(statePath));
  const counts: Record<string, number> = { all: 0 };
  for (const c of FIN_CATEGORIES) counts[c] = 0;
  for (const a of Object.values(state.articles || {}) as any[]) {
    const c = a && a.category;
    counts.all += 1;
    if (c && counts[c] != null) counts[c] += 1;
  }
  return counts;
}

function _isCurrentMonth(dateKey: string, now: Date): boolean {
  if (!dateKey) return false;
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return dateKey.startsWith(ym);
}

function _pruneArticles(
  articles: Record<string, FinArticle>,
  now: Date = new Date(),
): Record<string, FinArticle> {
  const byDay: any = {};
  for (const a of Object.values(articles || {}) as FinArticle[]) {
    if (!a || !a.id || !a.dateKey) continue;
    if (!_isCurrentMonth(a.dateKey, now)) continue;
    if (!byDay[a.dateKey]) byDay[a.dateKey] = [];
    byDay[a.dateKey].push(a);
  }
  const out: any = {};
  // 先按天切片（每天最多 FIN_ARTICLES_PER_DAY 条），再合并做全局上限截断。
  // 否则当月逐日累积（每天未触顶 400）会膨胀到上万条，撑大 state.json 并拖慢每次读取。
  const collected: any[] = [];
  for (const items of Object.values(byDay)) {
    (items as any[]).sort((x: any, y: any) => {
      const tx = Date.parse(x.pubDate || "") || 0;
      const ty = Date.parse(y.pubDate || "") || 0;
      return ty - tx;
    });
    for (const a of (items as any[]).slice(0, FIN_ARTICLES_PER_DAY)) {
      collected.push(a);
    }
  }
  collected.sort((x: any, y: any) => {
    const tx = Date.parse(x.pubDate || "") || 0;
    const ty = Date.parse(y.pubDate || "") || 0;
    return ty - tx;
  });
  for (const a of collected.slice(0, FIN_ARTICLES_TOTAL_CAP)) {
    out[a.id] = a;
  }
  return out;
}

function _statsStale(state: any): boolean {
  let maxFetched = 0;
  for (const a of Object.values(state.articles || {}) as any[]) {
    if (
      a &&
      a.sourceKey === "stats" &&
      typeof a.fetchedAt === "number"
    ) {
      maxFetched = Math.max(maxFetched, a.fetchedAt);
    }
  }
  if (!maxFetched) return true;
  return Date.now() - maxFetched > STATS_CACHE_TTL_MS;
}

export function loadAll(statePath?: any): any {
  const st = _normalizeState(readNewsState(statePath));
  return { ok: true, ...st };
}

/**
 * 拉取全部启用源，写 state，返回 {ok, added, total, ts, errorsPerSource}。
 * stats 源按 6h 节流；未过期时复用既有 stats 文章（保留在 articles 中）。
 */
export async function refresh(statePath?: any, opts: any = {}): Promise<any> {
  const existing = _normalizeState(
    readNewsState(statePath),
  );
  const sources: Record<string, boolean> = {
    eastmoney: true,
    wallstreetcn: true,
    stats: Boolean(opts.force) || _statsStale(existing),
  };
  const agg = await aggregateNews({ sources, timeoutMs: opts.timeoutMs });
  const now = Date.now();
  const articles: Record<string, FinArticle> = {
    ...(existing.articles as Record<string, FinArticle>),
  };
  for (const it of agg.items) {
    const prev = articles[it.id];
    articles[it.id] = {
      ...it,
      fetchedAt: prev ? prev.fetchedAt : now,
      readAt: prev ? prev.readAt : 0,
    };
  }
  const pruned = _pruneArticles(articles, new Date(now));
  const next = {
    ts: now,
    articles: pruned,
    favorites: existing.favorites || {},
  };
  writeNewsState(next, statePath);
  return {
    ok: true,
    added: agg.items.length,
    total: Object.keys(pruned).length,
    ts: now,
    errorsPerSource: agg.errorsPerSource,
  };
}

/**
 * 返回已过滤 + 排序的归一化列表（服务端过滤，对齐 IPC 契约）。
 * 每条带 isFavorited 标记，供 UI 展示收藏态。
 */
export function getFiltered(statePath: any, args: any = {}): FinArticle[] {
  const state = _normalizeState(readNewsState(statePath));
  const category = args && args.category ? String(args.category) : "all";
  const sort =
    args && args.sort === "popularity" ? "popularity" : "time";
  const search =
    args && args.search ? String(args.search).trim().toLowerCase() : "";
  let list: FinArticle[] = Object.values(state.articles || {});
  if (category !== "all") {
    list = list.filter((a) => a && a.category === category);
  }
  if (search) {
    list = list.filter((a) => {
      const t =
        `${(a.title || "")} ${(a.summary || "")} ${
          Array.isArray(a.tags) ? a.tags.join(" ") : ""
        }`.toLowerCase();
      return t.includes(search);
    });
  }
  list.sort((a: any, b: any) => {
    if (sort === "popularity") {
      const pa = Number(a.popularity) || 0;
      const pb = Number(b.popularity) || 0;
      if (pb !== pa) return pb - pa;
    }
    return (Date.parse(b.pubDate || "") || 0) - (Date.parse(a.pubDate || "") || 0);
  });
  const favIds = state.favorites || {};
  return list.map((a) => ({ ...a, isFavorited: Boolean(favIds[a.id]) }));
}

export function getArticle(statePath: any, id: any): FinArticle | null {
  if (!id || typeof id !== "string") return null;
  const state = _normalizeState(readNewsState(statePath));
  const art = state.articles[id];
  if (art) {
    return { ...art, isFavorited: Boolean(state.favorites && state.favorites[id]) };
  }
  const fav = state.favorites && state.favorites[id];
  return fav && fav.article ? { ...fav.article, isFavorited: true } : null;
}

/**
 * 相关推荐（服务端排序）：同标签优先，同分类补全，截断到 limit。
 * 用于详情页「相关推荐」回退源（列表为空 / 深链直达时），
 * 避免为算几条相关而全量拉取分类列表。
 */
export function getRelated(statePath: any, id: any, limit = 5): FinArticle[] {
  if (!id || typeof id !== "string") return [];
  const state = _normalizeState(readNewsState(statePath));
  const cur = state.articles[id];
  if (!cur) return [];
  const tags: string[] = Array.isArray(cur.tags) ? cur.tags : [];
  const all = Object.values(state.articles || {}) as FinArticle[];
  const sameTag = all.filter(
    (a) =>
      a &&
      a.id !== id &&
      (a.tags ?? []).some((t: string) => tags.includes(t)),
  );
  const fill = all.filter(
    (a) => a && a.id !== id && !sameTag.some((y) => y.id === a.id),
  );
  const favIds = state.favorites || {};
  return [...sameTag, ...fill]
    .slice(0, limit)
    .map((a) => ({ ...a, isFavorited: Boolean(favIds[a.id]) }));
}

export function toggleFavorite(statePath: any, id: any): any {
  if (!id || typeof id !== "string") return { ok: false, reason: "invalid_args" };
  const raw = readNewsState(statePath);
  const state = _normalizeState(raw);
  const favorites = { ...(state.favorites || {}) };
  if (favorites[id]) {
    delete favorites[id];
    writeNewsState({ ...state, favorites, ts: Date.now() }, statePath);
    return { ok: true, favorited: false, id };
  }
  const article = state.articles[id];
  if (!article) return { ok: false, reason: "article_not_found" };
  favorites[id] = {
    article: { ...article },
    favoritedAt: Date.now(),
    summary: null,
  };
  writeNewsState({ ...state, favorites, ts: Date.now() }, statePath);
  return { ok: true, favorited: true, id };
}

export function markRead(statePath: any, id: any): any {
  if (!id || typeof id !== "string") return { ok: false, reason: "invalid_args" };
  const raw = readNewsState(statePath);
  const state = _normalizeState(raw);
  if (!state.articles[id] && !(state.favorites && state.favorites[id])) {
    return { ok: false, reason: "article_not_found" };
  }
  const articles = { ...state.articles };
  if (articles[id] && !articles[id].readAt) {
    articles[id] = { ...articles[id], readAt: Date.now() };
  }
  const favorites = { ...(state.favorites || {}) };
  if (
    favorites[id] &&
    favorites[id].article &&
    !favorites[id].article.readAt
  ) {
    favorites[id] = {
      ...favorites[id],
      article: { ...favorites[id].article, readAt: Date.now() },
    };
  }
  writeNewsState({ ...state, articles, favorites, ts: Date.now() }, statePath);
  return { ok: true };
}

module.exports = {
  loadAll,
  refresh,
  getFiltered,
  getArticle,
  getRelated,
  getCategoryCounts,
  toggleFavorite,
  markRead,
};
