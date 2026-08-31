/**
 * src/renderer/finance/financeStore.ts
 *
 * Renderer 端 signals + bootstrap + 过滤 / 刷新 / 收藏 / 已读 / 行情轮询。
 * 镜像 wechat-hot/store.ts 风格。搜索框由 NewsLayoutHeader 统一持有，
 * FinanceContent 通过 prop 接收并按 filter 信号重载列表。
 */

import { signal } from "@preact/signals";
import { api } from "../api.ts";
import {
  beginDataRequest,
  createDataState,
  rejectData,
  resolveData,
  type DataSource,
  type DataState,
} from "../../shared/data-state.ts";
import type { FinanceNewsSort } from "../../shared/ipc-contracts.ts";

/** 当前分类（全部 | 股市 | 基金 | 债券 | 宏观 | 全球）。 */
export const financeCategory = signal("all");
/** 排序（time | popularity；popularity 缺省按 time 兜底）。 */
export const financeSort = signal<FinanceNewsSort>("time");
/** 搜索词（由 header 框驱动，FinanceContent 写入）。 */
export const financeSearch = signal("");

export const financeList = signal<any[]>([]);
export const financeNewsState = signal<DataState<any[]>>(createDataState([]));
export const financeLoading = signal(false);
export const financeError = signal<any>(null);
export const financeTs = signal(0);

export const financeFavorites = signal<Record<string, any>>({});

export const financeQuotes = signal<any>({ ts: 0, indices: {}, fx: {} });
export const financeQuoteLoading = signal(false);
export const financeQuoteError = signal<any>(null);

/** 详情视图选中的文章 id（null = 列表视图）。 */
export const financeSelectedId = signal<string | null>(null);

export function resolveFinanceArticleId(query: string): string | null {
  const raw = String(query || "").trim();
  if (!raw) return null;
  const q = raw.toLowerCase();
  for (const article of financeList.value || []) {
    if (!article?.id) continue;
    if (String(article.id) === raw) return String(article.id);
    const title = String(article.title || "").toLowerCase();
    if (title && (title.includes(q) || q.includes(title))) {
      return String(article.id);
    }
  }
  return null;
}

export function openFinanceArticle(opts: {
  id?: string;
  title?: string;
}): boolean {
  const id =
    (opts.id && String(opts.id).trim()) ||
    (opts.title ? resolveFinanceArticleId(opts.title) : null);
  if (!id) return false;
  financeSelectedId.value = id;
  return true;
}

/** E2：各分类文章计数（含「全部」），分类 tab 旁展示。 */
export const financeCategoryCounts = signal<Record<string, number>>({ all: 0 });

export const financeUpdatedUnsub = signal<any>(null);
export const financeQuotesUnsub = signal<any>(null);

/** 格式化 pubDate 为「MM-DD HH:mm」（上海时区）。
 *  Intl.DateTimeFormat 构造有成本，locale/options 恒定 → 模块级单例，避免每次渲染重复构造。 */
const TIME_FMT = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatFinanceTime(pubDate: any): string {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return "";
  return TIME_FMT.format(d);
}

/** E2：拉取各分类计数（全量，不随当前过滤变化）。 */
export function applyCategoryCounts(): void {
  api
    .financeGetCategories()
    .then((c: any) => {
      if (c && typeof c === "object") financeCategoryCounts.value = c;
    })
    .catch(() => {
      /* 保持上次计数 */
    });
}

/** 按当前 category / sort / search 重新拉取过滤列表。 */
export function applyNewsFilters(
  search?: string,
  options: { source?: DataSource } = {},
): void {
  const q = typeof search === "string" ? search : financeSearch.value;
  financeSearch.value = q;
  financeLoading.value = true;
  financeNewsState.value = beginDataRequest(financeNewsState.value);
  financeError.value = null;
  api
    .financeGetNews({
      category: financeCategory.value,
      sort: financeSort.value,
      search: q,
    })
    .then((list: any) => {
      // 契约（register-finance finance:get-news）永远返回数组，无需 list.items 双形防御
      financeList.value = Array.isArray(list) ? list : [];
      financeTs.value = Date.now();
      financeNewsState.value = resolveData(financeNewsState.value, financeList.value, {
        source: options.source || "cache",
        fetchedAt: financeTs.value,
      });
    })
    .catch((err: any) => {
      financeError.value = (err && err.message) || "加载失败";
      financeNewsState.value = rejectData(financeNewsState.value, financeError.value);
    })
    .finally(() => {
      financeLoading.value = false;
    });
}

export async function refreshFinanceNews(): Promise<boolean> {
  if (financeLoading.value) return false;
  financeLoading.value = true;
  financeNewsState.value = beginDataRequest(financeNewsState.value);
  financeError.value = null;
  try {
    const r = await api.financeRefreshNews({});
    if (r && r.ok === false) {
      financeError.value = (r.reason as string) || "刷新失败";
      financeNewsState.value = rejectData(financeNewsState.value, financeError.value);
      return false;
    }
    applyNewsFilters(financeSearch.value, { source: "live" });
    applyCategoryCounts();
    return true;
  } catch (err: any) {
    financeError.value = (err && err.message) || "刷新失败";
    financeNewsState.value = rejectData(financeNewsState.value, financeError.value);
    return false;
  } finally {
    financeLoading.value = false;
  }
}

export function applyQuotes(): void {
  api
    .financeGetQuotes()
    .then((q: any) => {
      financeQuotes.value =
        q && typeof q === "object" ? q : { ts: 0, indices: {}, fx: {} };
    })
    .catch(() => {
      /* 保留上次缓存 */
    });
}

export async function refreshMarketQuotes(): Promise<boolean> {
  if (financeQuoteLoading.value) return false;
  financeQuoteLoading.value = true;
  financeQuoteError.value = null;
  try {
    const r = await api.financeRefreshQuotes({});
    if (r && r.ok === false) {
      financeQuoteError.value = (r.reason as string) || "行情刷新失败";
    }
    applyQuotes();
    return true;
  } catch (err: any) {
    financeQuoteError.value = (err && err.message) || "行情刷新失败";
    return false;
  } finally {
    financeQuoteLoading.value = false;
  }
}

export async function bootstrapFinance(): Promise<void> {
  financeNewsState.value = beginDataRequest(financeNewsState.value);
  try {
    const cached = await api.financeGetNews({
      category: financeCategory.value,
      sort: financeSort.value,
      search: financeSearch.value,
    });
    financeList.value = Array.isArray(cached) ? cached : [];
    financeNewsState.value = resolveData(financeNewsState.value, financeList.value, {
      source: "cache",
      fetchedAt: Date.now(),
    });
  } catch {
    financeNewsState.value = rejectData(financeNewsState.value, "读取财经缓存失败");
  }
  // C4：先 await 行情加载完成，再据真实缓存判断是否首拉，避免依赖初始空值
  await applyQuotes();
  // 首次进入且无缓存行情时主动拉一次
  const q = financeQuotes.value;
  if (!q || !q.indices || Object.keys(q.indices).length === 0) {
    void refreshMarketQuotes();
  }
  // 列表为空时自动拉一次（避免空白）
  if (financeList.value.length === 0) {
    void refreshFinanceNews();
  }
  applyCategoryCounts();
  subscribeFinanceUpdates();
}

export function subscribeFinanceUpdates(): void {
  if (!financeUpdatedUnsub.value) {
    const unsub = api.onFinanceNewsUpdated((payload: any) => {
      // 收藏变更只更新态，不重载列表（避免打断滚动）
      if (payload && payload.favoriteChanged) return;
      applyNewsFilters(financeSearch.value);
      applyCategoryCounts();
    });
    financeUpdatedUnsub.value = typeof unsub === "function" ? unsub : null;
  }
  if (!financeQuotesUnsub.value) {
    const unsubQ = api.onFinanceQuotesUpdated(() => applyQuotes());
    financeQuotesUnsub.value = typeof unsubQ === "function" ? unsubQ : null;
  }
}

export function cleanupFinanceUpdates(): void {
  if (financeUpdatedUnsub.value) {
    try {
      financeUpdatedUnsub.value();
    } catch {
      /* noop */
    }
    financeUpdatedUnsub.value = null;
  }
  if (financeQuotesUnsub.value) {
    try {
      financeQuotesUnsub.value();
    } catch {
      /* noop */
    }
    financeQuotesUnsub.value = null;
  }
}

export async function toggleFinanceFavorite(id: string): Promise<any> {
  if (!id) return { ok: false };
  try {
    const r = await api.financeToggleFavorite({ id });
    financeList.value = financeList.value.map((a: any) =>
      a.id === id ? { ...a, isFavorited: !a.isFavorited } : a,
    );
    return r;
  } catch {
    return { ok: false };
  }
}

export async function markFinanceRead(id: string): Promise<any> {
  if (!id) return { ok: false };
  try {
    const r = await api.financeMarkRead({ id });
    financeList.value = financeList.value.map((a: any) =>
      a.id === id ? { ...a, readAt: a.readAt || Date.now() } : a,
    );
    return r;
  } catch {
    return { ok: false };
  }
}

/** AI 解读结果（当前详情文章）。null = 未请求/无结果/解析失败。 */
export const financeAi = signal<any>(null);
export const financeAiLoading = signal(false);
export const financeAiError = signal<any>(null);

/**
 * 请求单篇 AI 解读（按需懒加载，零默认成本）。结果写入 financeAi 信号。
 * 调用方应先确认 isAiReadyLocal()，避免无谓 IPC。
 */
export async function requestInterpret(id: string): Promise<any> {
  if (!id) return { ok: false };
  financeAiLoading.value = true;
  financeAiError.value = null;
  try {
    const r = await api.financeInterpret({ id });
    if (r && r.ok) {
      financeAi.value = r;
    } else {
      financeAi.value = null;
      financeAiError.value = (r && (r.reason || r.error)) || "解读失败";
    }
    return r;
  } catch (err: any) {
    financeAi.value = null;
    financeAiError.value = (err && err.message) || "解读失败";
    return { ok: false };
  } finally {
    financeAiLoading.value = false;
  }
}

/** 清除单篇缓存并重新解读（「重新解读」按钮）。 */
export async function clearInterpret(id: string): Promise<any> {
  if (!id) return { ok: false };
  try {
    await api.financeInterpretClear({ id });
  } catch {
    /* 清除失败不阻断后续重解读 */
  }
  financeAi.value = null;
  return requestInterpret(id);
}

// ─────────────────────────────────────────────────────────────
// P2：跨新闻聚合视图状态 + 动作
// ─────────────────────────────────────────────────────────────

/** 财经内容区视图模式：list = 列表，aggregate = AI 聚合洞察。 */
export const financeViewMode = signal<"list" | "aggregate">("list");

/** 跨新闻聚合结果。null = 未请求/无结果/解析失败。 */
export const financeAggregate = signal<any>(null);
export const financeAggregateLoading = signal(false);
export const financeAggregateError = signal<any>(null);
/** 当前聚合作用域（分类 key 或 "all"），供重聚合复用。 */
export const financeAggregateScope = signal<string>("all");

/**
 * 请求跨新闻聚合（按需，零默认成本）。结果写入 financeAggregate 信号。
 * force=true 时跳过缓存（「重新聚合」按钮）。
 */
export async function requestAggregate(
  scope?: string,
  force?: boolean,
): Promise<any> {
  const cat = scope && scope !== "all" ? scope : "all";
  financeAggregateScope.value = cat;
  financeAggregateLoading.value = true;
  financeAggregateError.value = null;
  try {
    const r = await api.financeAggregate({ category: cat, force: !!force });
    if (r && r.ok) {
      financeAggregate.value = r;
    } else {
      financeAggregate.value = null;
      financeAggregateError.value = (r && (r.reason || r.error)) || "聚合失败";
    }
    return r;
  } catch (err: any) {
    financeAggregate.value = null;
    financeAggregateError.value = (err && err.message) || "聚合失败";
    return { ok: false };
  } finally {
    financeAggregateLoading.value = false;
  }
}

/** 清除聚合缓存并重新聚合（「重新聚合」按钮）。 */
export async function clearAggregate(scope?: string): Promise<any> {
  const cat = scope && scope !== "all" ? scope : "all";
  return requestAggregate(cat, true);
}
