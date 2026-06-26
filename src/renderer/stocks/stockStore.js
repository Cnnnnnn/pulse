/**
 * src/renderer/stocks/stockStore.js
 *
 * 选股分析 renderer store — signals. 对照 fundStore.js.
 *
 * State:
 *   criteria: object            // 当前筛选条件
 *   activeStrategy: string      // 策略 id, "custom" = 自定义
 *   results: StockRow[]         // 筛选结果
 *   fetchedAt/loading/error     // 状态
 *   sortKey/sortDir             // 排序
 *   watchlist: StockWatchItem[] // 自选股
 *   watchlistQuotes: object     // 自选股行情 {code:{...}}
 *   advancedOpen: boolean       // 高级条件折叠
 */
import { signal, computed } from "@preact/signals";
import { taggedLog } from "../log.js";
import { STRATEGIES, buildCriteria, getStrategy } from "../../stocks/strategies";
import { DEFAULT_SCREENER_CRITERIA } from "../../stocks/stock-constants";

const log = taggedLog("[stocks]");

// ── signals ──

export const criteria = signal({ ...DEFAULT_SCREENER_CRITERIA });
export const activeStrategy = signal("value_roe");
export const results = signal([]);
export const fetchedAt = signal(null);
export const loading = signal(false);
export const error = signal(null);
export const sortKey = signal("roe");
export const sortDir = signal("desc");
export const watchlist = signal([]);
export const watchlistQuotes = signal({});
export const advancedOpen = signal(false);
export const addModalOpen = signal(false);

export const sortConfig = computed(() => ({
  key: sortKey.value,
  dir: sortDir.value,
}));

// ── mutations (renderer-side) ──

/** 选中预设策略: 用 buildCriteria 填充条件区 */
export function applyStrategy(id) {
  const c = buildCriteria(id);
  if (!c) return;
  criteria.value = c;
  activeStrategy.value = id;
}

/** 手动改条件 → 切 custom (所有 chip 取消高亮) */
export function setCriteria(patch) {
  criteria.value = { ...criteria.value, ...patch };
  activeStrategy.value = "custom";
}

export function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
}

export function toggleAdvanced() {
  advancedOpen.value = !advancedOpen.value;
}

export function openAddModal() {
  addModalOpen.value = true;
}

export function closeAddModal() {
  addModalOpen.value = false;
}

/** 是否在自选 (表格 ⭐ 用) */
export function isInWatchlist(code) {
  return (watchlist.value || []).some((w) => w.code === code);
}

// ── async actions (走 IPC) ──

export async function runScreen(api) {
  loading.value = true;
  error.value = null;
  try {
    const r = await api.stocksScreen({
      criteria: criteria.value,
      sort: sortConfig.value,
    });
    if (r && r.ok) {
      results.value = r.results || [];
      fetchedAt.value = r.fetchedAt;
    } else {
      error.value = (r && r.error) || "筛选失败";
      results.value = [];
    }
  } catch (e) {
    log.warn("runScreen failed:", e && e.message);
    error.value = e && e.message ? e.message : String(e);
    results.value = [];
  } finally {
    loading.value = false;
  }
}

export async function loadWatchlist(api) {
  try {
    const r = await api.stocksWatchlistList();
    if (r && r.ok) watchlist.value = r.items || [];
  } catch (e) {
    log.warn("loadWatchlist failed:", e && e.message);
  }
}

export async function addWatchlist(api, code) {
  const r = await api.stocksWatchlistAdd({ code });
  if (r && r.ok) {
    watchlist.value = r.items || [];
    return { ok: true };
  }
  return { ok: false, error: r && r.error };
}

export async function removeWatchlist(api, code) {
  const r = await api.stocksWatchlistRemove({ code });
  if (r && r.ok) {
    watchlist.value = r.items || [];
  }
  return r;
}

export async function refreshWatchlistQuotes(api) {
  const r = await api.stocksWatchlistQuotes();
  if (r && r.ok) watchlistQuotes.value = r.quotes || {};
  return r;
}

/** 订阅主进程自选股行情推送 (StockQuoteScheduler) */
export function subscribeWatchlistQuotes(api) {
  const off = api.onStocksWatchlistQuotes((payload) => {
    if (payload && payload.quotes) watchlistQuotes.value = payload.quotes;
  });
  return () => {
    try {
      off && off();
    } catch {
      /* noop */
    }
  };
}

export { STRATEGIES, getStrategy };
