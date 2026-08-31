/**
 * AI 解读类助手工具 — 复用 finance / ithome / stocks 现有 LLM 管线.
 */
import type { ToolCardItem, ToolResult } from "./assistant-tools";
import {
  interpretCacheKey,
  withInterpretCache,
} from "./assistant-interpret-cache";

const STOCK_INTENT_CHIPS: Record<string, { id: string; label: string }> = {
  low_value: { id: "low_value", label: "低估值修复" },
  high_div: { id: "high_div", label: "高分红防御" },
  oversold: { id: "oversold", label: "超跌反弹" },
  growth_momentum: { id: "growth_momentum", label: "成长动量" },
  industry_leader: { id: "industry_leader", label: "行业龙头" },
  balanced: { id: "balanced", label: "平衡型" },
};

const REASON_LABELS: Record<string, string> = {
  article_not_found: "未找到对应文章，请提供 id 或更准确的标题关键词",
  config_missing: "请先在设置中配置 AI Provider 和 API Key",
  api_key_missing: "请先在设置中配置 API Key",
  budget_exceeded: "今日 Token 预算已用尽",
  llm_failed: "AI 请求失败，请稍后再试",
  parse_failed: "AI 返回格式异常，请重试",
};

function fail(tool: string, reason: string, extra?: string): ToolResult {
  const hint = REASON_LABELS[reason] || reason;
  return {
    tool,
    ok: false,
    summary: extra ? `${hint}\n${extra}` : hint,
  };
}

export function resolveStockIntentChip(intent?: string): { id: string; label: string } {
  const fallback = STOCK_INTENT_CHIPS.balanced;
  if (!intent || !String(intent).trim()) return fallback;
  const raw = String(intent).trim();
  const key = raw.toLowerCase();
  if (STOCK_INTENT_CHIPS[key]) return STOCK_INTENT_CHIPS[key];
  for (const chip of Object.values(STOCK_INTENT_CHIPS)) {
    if (chip.label.includes(raw) || raw.includes(chip.label)) return chip;
  }
  return fallback;
}

function resolveFinanceArticleId(
  params: Record<string, unknown>,
  pageData?: Record<string, unknown>,
): string | null {
  if (typeof params.id === "string" && params.id.trim()) {
    return params.id.trim();
  }
  const ctx = pageData?.financeArticle as { id?: string } | undefined;
  if (ctx?.id) return ctx.id;
  const title =
    (typeof params.title === "string" && params.title.trim()) ||
    (typeof params.q === "string" && params.q.trim()) ||
    "";
  if (!title) return null;
  const newsStore: any = require("../main/finance/news-store.js");
  const hits = newsStore.getFiltered(undefined, {
    category: "all",
    search: title,
    sort: "time",
  });
  return hits[0]?.id || null;
}

function resolveIthomeArticleId(
  params: Record<string, unknown>,
  pageData?: Record<string, unknown>,
): string | null {
  if (typeof params.id === "string" && params.id.trim()) {
    return params.id.trim();
  }
  const ctx = pageData?.ithomeArticle as { id?: string } | undefined;
  if (ctx?.id) return ctx.id;
  const title =
    (typeof params.title === "string" && params.title.trim()) ||
    (typeof params.q === "string" && params.q.trim()) ||
    "";
  if (!title) return null;
  const newsStore: any = require("../main/ithome/news-store");
  const all = newsStore.loadAll();
  const articles = Object.values(all?.articles || {}) as Array<{ id?: string; title?: string }>;
  const q = title.toLowerCase();
  const hit = articles.find(
    (a) => a?.title && String(a.title).toLowerCase().includes(q),
  );
  return hit?.id || null;
}

function loadMoviesPayload(): {
  nowPlaying: Array<{ id?: string; title?: string; rating?: number; genre?: string }>;
  coming: Array<{ id?: string; title?: string; releaseDate?: string }>;
  source?: string;
} | null {
  const pathMod = require("node:path");
  const { createFilePersist } = require("../main/movies/cache");
  const { getMoviesSample } = require("../main/movies/sample");
  let filePath: string | null = null;
  try {
    const electron = require("electron");
    const base = electron?.app?.getPath?.("userData");
    if (base) filePath = pathMod.join(base, "movies-cache.json");
  } catch {
    /* noop */
  }
  const disk = createFilePersist(filePath).read();
  const payload = disk?.payload;
  if (payload && Array.isArray(payload.nowPlaying)) {
    return payload;
  }
  return getMoviesSample();
}

export async function runInterpretFinance(
  params: Record<string, unknown>,
  pageData?: Record<string, unknown>,
): Promise<ToolResult> {
  const id = resolveFinanceArticleId(params, pageData);
  if (!id) {
    return fail(
      "interpret_finance",
      "article_not_found",
      "可在财经新闻页选中文章后说「解读这篇」，或提供 title 关键词。",
    );
  }
  const cacheKey = interpretCacheKey("interpret_finance", { id });
  return withInterpretCache(cacheKey, async () => {
  const { fetchFinanceInterpret } = require("./finance-news-interpret");
  const res = await fetchFinanceInterpret({
    id,
    force: params.force === true,
  });
  if (!res?.ok) {
    return fail("interpret_finance", res?.reason || "llm_failed", res?.error);
  }
  const lines = [res.summary || ""];
  if (Array.isArray(res.highlights) && res.highlights.length > 0) {
    lines.push(`要点：${res.highlights.join("；")}`);
  }
  if (res.sentiment?.label) {
    lines.push(`情绪：${res.sentiment.label}`);
  }
  if (res.cached) lines.push("（持久缓存）");
  return {
    tool: "interpret_finance",
    ok: true,
    summary: lines.filter(Boolean).join("\n"),
    items: [
      {
        label: "打开财经新闻",
        meta: id,
        action: { tool: "open_finance_article", params: { id } },
      },
    ],
  };
  });
}

export async function runSummarizeIthome(
  params: Record<string, unknown>,
  pageData?: Record<string, unknown>,
): Promise<ToolResult> {
  const id = resolveIthomeArticleId(params, pageData);
  if (!id) {
    return fail(
      "summarize_ithome",
      "article_not_found",
      "请提供 IT 资讯标题关键词，或在新闻页选中文章后说「总结这篇」。",
    );
  }
  const cacheKey = interpretCacheKey("summarize_ithome", { id });
  return withInterpretCache(cacheKey, async () => {
  const { summarizeArticle } = require("../main/ithome/article-ai.ts");
  const res = await summarizeArticle({ id, force: params.force === true });
  if (!res?.ok) {
    return fail("summarize_ithome", res?.reason || "llm_failed", res?.error);
  }
  const text = res.abstract || res.text || "";
  const lines = [text];
  if (Array.isArray(res.keywords) && res.keywords.length > 0) {
    lines.push(`关键词：${res.keywords.slice(0, 6).join("、")}`);
  }
  if (res.cached) lines.push("（持久缓存）");
  return {
    tool: "summarize_ithome",
    ok: true,
    summary: lines.filter(Boolean).join("\n"),
    items: [
      {
        label: "打开 IT 资讯",
        meta: id,
        action: { tool: "open_ithome_article", params: { id } },
      },
    ],
  };
  });
}

export async function runAdviseStocks(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const intentChip = resolveStockIntentChip(
    typeof params.intent === "string" ? params.intent : undefined,
  );
  const freeText =
    typeof params.freeText === "string"
      ? params.freeText
      : typeof params.q === "string"
        ? params.q
        : "";
  const cacheKey = interpretCacheKey("advise_stocks", {
    intent: intentChip.id,
    freeText: freeText.trim(),
  });
  return withInterpretCache(cacheKey, async () => {
  const { computeMarketOverview } = require("../stocks/market-overview");
  const { aiStockAdvise } = require("./stock-screener-advisor");
  const marketOverview = computeMarketOverview([]);
  const res = await aiStockAdvise({
    intentChip,
    freeText: freeText || undefined,
    marketOverview,
  });
  if (!res?.ok || !res.result) {
    return fail("advise_stocks", res?.reason || "llm_failed", res?.error);
  }
  const { criteria, sortConfig, summary } = res.result;
  const critParts: string[] = [];
  if (criteria?.peMin != null || criteria?.peMax != null) {
    critParts.push(`PE ${criteria.peMin ?? "—"}~${criteria.peMax ?? "—"}`);
  }
  if (criteria?.roeMin != null) critParts.push(`ROE≥${criteria.roeMin}%`);
  if (criteria?.marketCapTier && criteria.marketCapTier !== "all") {
    critParts.push(`市值档 ${criteria.marketCapTier}`);
  }
  const lines = [
    `策略：${intentChip.label}`,
    summary,
    critParts.length > 0 ? `筛选建议：${critParts.join("，")}` : "",
    sortConfig ? `排序：${sortConfig.key} ${sortConfig.dir}` : "",
    res.fromCache ? "（持久缓存）" : "",
  ];
  return {
    tool: "advise_stocks",
    ok: true,
    summary: lines.filter(Boolean).join("\n"),
    items: [
      {
        label: "打开股票筛选",
        meta: intentChip.label,
        action: { tool: "navigate", params: { nav: "invest", tab: "stocks" } },
      },
    ],
  };
  });
}

export function runQueryMovies(params: Record<string, unknown>): ToolResult {
  const payload = loadMoviesPayload();
  if (!payload) {
    return {
      tool: "query_movies",
      ok: true,
      summary: "暂无电影数据，可以说「打开电影页」后刷新片单。",
      items: [
        {
          label: "打开电影页",
          action: { tool: "navigate", params: { nav: "movies" } },
        },
      ],
    };
  }
  const mode =
    params.mode === "coming" ? "coming" : params.mode === "now" ? "now" : "all";
  const now = (payload.nowPlaying || []).slice(0, 8);
  const coming = (payload.coming || []).slice(0, 8);
  const fmtNow = (m: { title?: string; rating?: number }) =>
    `${m.title || "?"}${m.rating != null ? ` ${m.rating}分` : ""}`;
  const fmtComing = (m: { title?: string; releaseDate?: string }) =>
    `${m.title || "?"}${m.releaseDate ? ` (${m.releaseDate})` : ""}`;
  const lines: string[] = [];
  const items: ToolCardItem[] = [];
  if (mode === "now" || mode === "all") {
    lines.push(
      `热映 ${now.length} 部：${now.map(fmtNow).join("；") || "暂无"}`,
    );
    for (const m of now.slice(0, 6)) {
      items.push({
        label: m.title || "?",
        meta: m.rating != null ? `${m.rating}分` : undefined,
        action: {
          tool: "open_movie_detail",
          params: { movieId: m.id, title: m.title || "" },
        },
      });
    }
  }
  if (mode === "coming" || mode === "all") {
    lines.push(
      `即将上映 ${coming.length} 部：${coming.map(fmtComing).join("；") || "暂无"}`,
    );
  }
  if (payload.source) {
    lines.push(`数据源：${payload.source}`);
  }
  return {
    tool: "query_movies",
    ok: true,
    summary: lines.join("\n"),
    items,
  };
}

function loadConcertsPayload(): {
  watches: Array<{ id: string; url?: string }>;
  snapshots: Record<
    string,
    {
      title?: string;
      city?: string;
      venue?: string;
      error?: string;
      sessions?: Array<{
        name?: string;
        time?: string;
        minPrice?: string;
        status?: string;
        hasTicket?: boolean;
      }>;
    }
  >;
  fetchedAt?: number;
  source?: string;
} | null {
  const pathMod = require("node:path");
  const { createFilePersist } = require("../main/concerts/cache");
  let filePath: string | null = null;
  try {
    const electron = require("electron");
    const base = electron?.app?.getPath?.("userData");
    if (base) filePath = pathMod.join(base, "concerts-cache.json");
  } catch {
    /* noop */
  }
  const disk = createFilePersist(filePath).read();
  const payload = disk?.payload;
  if (payload && Array.isArray(payload.watches)) {
    return payload;
  }
  return null;
}

function fmtConcertSession(
  s: {
    name?: string;
    time?: string;
    minPrice?: string;
    status?: string;
    hasTicket?: boolean;
  },
): string {
  const parts = [s.name || s.time || "场次"];
  if (s.minPrice) parts.push(s.minPrice);
  else if (s.status === "SOLDOUT") parts.push("售罄");
  else if (s.hasTicket === false) parts.push("无票");
  return parts.join(" ");
}

export function runQueryConcerts(): ToolResult {
  const payload = loadConcertsPayload();
  if (!payload || payload.watches.length === 0) {
    return {
      tool: "query_concerts",
      ok: true,
      summary:
        "暂无监控的演出。可以说「打开演出页」添加票牛/摩天轮链接后开始盯价。",
      items: [
        {
          label: "打开演出监控",
          action: { tool: "navigate", params: { nav: "concerts" } },
        },
      ],
    };
  }
  const lines: string[] = [`共监控 ${payload.watches.length} 场演出：`];
  const items: ToolCardItem[] = [];
  for (const watch of payload.watches.slice(0, 8)) {
    const snap = payload.snapshots?.[watch.id];
    if (!snap) {
      lines.push(`• ${watch.id}（暂无快照）`);
      continue;
    }
    const loc = [snap.city, snap.venue].filter(Boolean).join(" · ");
    const sessions = (snap.sessions || []).slice(0, 2);
    const sessBrief =
      sessions.length > 0
        ? sessions.map(fmtConcertSession).join("；")
        : "暂无场次";
    const errMark = snap.error ? " [数据可能过期]" : "";
    lines.push(`• ${snap.title || watch.id}${loc ? `（${loc}）` : ""}：${sessBrief}${errMark}`);
    items.push({
      label: snap.title || watch.id,
      meta: loc || sessBrief,
      action: { tool: "navigate", params: { nav: "concerts" } },
    });
  }
  if (payload.source) {
    lines.push(`数据源：${payload.source}`);
  }
  return {
    tool: "query_concerts",
    ok: true,
    summary: lines.join("\n"),
    items,
  };
}

module.exports = {
  resolveStockIntentChip,
  runInterpretFinance,
  runSummarizeIthome,
  runAdviseStocks,
  runQueryMovies,
  runQueryConcerts,
};
