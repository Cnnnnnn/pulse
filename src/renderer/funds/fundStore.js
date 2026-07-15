/**
 * src/renderer/funds/fundStore.js
 *
 * v2.10+ 基金管理 — renderer store (signals).
 *
 * 跟 v2.6 主体 0 共享 (跟 worldcup/store.js 一个套路).
 *
 * State:
 *   holdings: FundHolding[]                  // 持久化 (主进程维护)
 *   navCache: { fetchedAt, data, errors }    // 推送 (主进程维护)
 *   schedulerState: { status, lastFetch, nextFetch }
 *   activeCategory: 'all' | categoryId
 *   searchQuery: string
 *   addModalOpen: boolean
 *   editingHolding: FundHolding | null
 *
 * v1.0 (2026-06-12) — 初版
 */

import { signal, computed } from "@preact/signals";
import { taggedLog } from "../log.js";
import {
  calcPortfolioTotal,
  zipHoldingsWithNav,
  rowWithMetrics,
  groupCountByCategory,
} from "../../funds/fundCalc.js";
import {
  computeMonthlyRollups,
  monthProfit,
  ymShanghai,
} from "../../funds/fund-history.js";
import {
  resolveNavSnapshot,
  NAV_SOURCE_LABELS,
  DEFAULT_NAV_SOURCE,
  normalizeNavSource,
} from "../../funds/fund-nav-merge.js";
import { isFundPinned } from "../watchlist/watchlist-store.js";

const log = taggedLog("[funds]");

// ── signals ──

export const holdings = signal([]);
export const navCache = signal({ fetchedAt: null, data: {}, errors: {} });
export const schedulerState = signal({
  status: "closed",
  lastFetch: null,
  nextFetch: null,
});
export const activeCategory = signal("all");
export const searchQuery = signal("");
// ponytail: 投资 nav 合并 (2026-07-13) — 基金二级 tab 'all' / 'watch' 单一真相,
// InvestLayout / InvestLayoutHeader / FundContent 三处共用, 不在 InvestLayout 本地另建.
// 默认 'all' — 跟用户老习惯一致, 自选是增强入口.
export const fundView = signal("all");
export const addModalOpen = signal(false);
export const editingHolding = signal(null);
export const dailySnapshots = signal([]);
export const selectedHistoryMonth = signal(ymShanghai(new Date()));
export const navSource = signal(DEFAULT_NAV_SOURCE);
export const alertPrefs = signal({
  enabled: false,
  profitPct: 10,
  lossPct: -5,
});
export const alertModalOpen = signal(false);

// ── 刷新 / 加载 状态信号 (P0 体验增强) ──

/** 净值即时刷新中 */
export const fundsRefreshing = signal(false);
/** 净值即时刷新错误 (string | null) */
export const fundsRefreshError = signal(null);

/** 持仓列表加载中 */
export const fundsLoading = signal(false);
/** 持仓列表加载错误 (string | null) */
export const fundsLoadError = signal(null);

/** I6 v3: 盈亏提醒未读角标 */
export const fundUnreadBadge = signal(0);

export function clearFundNavBadge() {
  fundUnreadBadge.value = 0;
}

export function bumpFundNavBadge(count = 1) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return;
  fundUnreadBadge.value += n;
}
export { NAV_SOURCE_LABELS };

// ── computed ──

/**
 * 所有持仓行 (holding + navSnap + metrics) — 给 FundList / Header 总览用
 */
export const rowsWithMetrics = computed(() => {
  const h = holdings.value || [];
  const map = (navCache.value && navCache.value.data) || {};
  const src = navSource.value;
  return zipHoldingsWithNav(h, map).map((row) => {
    const resolved = resolveNavSnapshot(row.navSnap, src);
    return {
      ...rowWithMetrics({ holding: row.holding, navSnap: resolved }),
      rawNavSnap: row.navSnap,
    };
  });
});

/**
 * 总览数字 — 给 FundHeader 用
 */
export const totalMetrics = computed(() => {
  return calcPortfolioTotal(rowsWithMetrics.value);
});

/**
 * 按 category 过滤 + 搜索过滤 + 自选过滤 — 给 FundList / FundCardGrid 用
 *
 * 投资 nav 合并 (2026-07-13) N4: 'watch' 视图叠 isFundPinned 过滤.
 * ponytail: fundView 是 signal, computed 自动响应; FundCardGrid 无需感知 fundView 存在.
 */
export const filteredRows = computed(() => {
  let rows = rowsWithMetrics.value;
  const cat = activeCategory.value;
  if (cat !== "all") {
    rows = rows.filter((r) => (r.holding && r.holding.category) === cat);
  }
  const q = (searchQuery.value || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const h = r.holding || {};
      const n = (h.name || "").toLowerCase();
      const c = h.code || "";
      return n.includes(q) || c.includes(q);
    });
  }
  // N4: watch 视图叠一层 isFundPinned 过滤
  if (fundView.value === "watch") {
    rows = rows.filter((r) => isFundPinned(r.holding && r.holding.code));
  }
  return rows;
});

/**
 * category tab 计数 — 给 CategoryTabs 用
 */
export const categoryCounts = computed(() => {
  const c = groupCountByCategory(holdings.value || []);
  return { all: (holdings.value || []).length, ...c };
});

export const pnlRollups = computed(() =>
  computeMonthlyRollups(dailySnapshots.value || []),
);

export const selectedMonthProfit = computed(() =>
  monthProfit(dailySnapshots.value || [], selectedHistoryMonth.value),
);

// ── 2026-07-13 投资 nav 合并: listed 判定 (N5) ──
// ponytail: holding 模型无 `listed` 字段 (历史负债, 改不动). 用 6 位代码前缀白名单兜底.
//   沪深 ETF/LOF = 51/56/58 (沪) + 15/16/18 (深) 开头.
//   场外开放式 = 0/1 开头但不在上述区间 (000xxx/001xxx/110xxx).
//   新增场内代码段需更新 LISTED_PREFIXES.
const LISTED_PREFIXES = ["51", "56", "58", "15", "16", "18"];

/**
 * @param {unknown} code — 6 位字符串基金代码
 * @returns {boolean} true = 场内 ETF/LOF (可入对比池)
 */
export function isListedFundCode(code) {
  if (typeof code !== "string" || code.length !== 6) return false;
  return LISTED_PREFIXES.some((p) => code.startsWith(p));
}

// ── mutations (renderer-side, 不走 IPC) ──

export function setActiveCategory(id) {
  activeCategory.value = id;
}

export function setSearchQuery(q) {
  searchQuery.value = q;
}

export function openAddModal() {
  editingHolding.value = null;
  addModalOpen.value = true;
}

export function openEditModal(holding) {
  editingHolding.value = holding;
  addModalOpen.value = true;
}

export function closeModal() {
  addModalOpen.value = false;
  editingHolding.value = null;
}

export function openAlertModal() {
  alertModalOpen.value = true;
}

export function closeAlertModal() {
  alertModalOpen.value = false;
}

// ── async actions (走 IPC) ──

export async function loadFunds(api) {
  fundsLoading.value = true;
  fundsLoadError.value = null;
  try {
    const r = await api.fundsList();
    if (r && r.ok) {
      holdings.value = r.holdings || [];
      navSource.value = normalizeNavSource(r.navSource);
      if (r.alertPrefs) {
        alertPrefs.value = {
          enabled: !!r.alertPrefs.enabled,
          profitPct: Number(r.alertPrefs.profitPct) || 10,
          lossPct: Number(r.alertPrefs.lossPct) || -5,
        };
      }
    } else {
      holdings.value = [];
      fundsLoadError.value = (r && r.reason) || '加载失败';
    }
  } catch (err) {
    log.warn("loadFunds failed:", err && err.message);
    holdings.value = [];
    fundsLoadError.value = (err && err.message) || '加载失败';
  } finally {
    fundsLoading.value = false;
  }
}

export async function addFund(api, input) {
  const r = await api.fundsAdd(input);
  if (r && r.ok) {
    holdings.value = r.holdings || [];
    import("../recent/track.js").then((m) =>
      m.trackFundAdd(input && input.code, input && input.name),
    );
    return { ok: true, holding: r.holding };
  }
  return { ok: false, reason: r && r.reason, error: r && r.error };
}

export async function updateFund(api, id, patch) {
  const r = await api.fundsUpdate(id, patch);
  if (r && r.ok) {
    holdings.value = r.holdings || [];
    const h = r.holding || {};
    import("../recent/track.js").then((m) =>
      m.trackFundUpdate(h.code || id, h.name, patch),
    );
    return { ok: true, holding: r.holding };
  }
  return { ok: false, reason: r && r.reason, error: r && r.error };
}

export async function removeFund(api, id) {
  const removed = (holdings.value || []).find((h) => h && h.id === id) || {};
  const r = await api.fundsRemove(id);
  if (r && r.ok) {
    holdings.value = r.all ? r.all.holdings : [];
    import("../recent/track.js").then((m) =>
      m.trackFundRemove(removed.code || id, removed.name),
    );
    return { ok: true };
  }
  return { ok: false, reason: r && r.reason };
}

/**
 * 用最新净值反填占位 holding (costNav=0 → costNav=nav, shares=amount/nav).
 * 走主进程 funds:backfill, 然后 reload holdings.
 */
export async function backfillFund(api, code) {
  const r = await api.fundsBackfill(code);
  if (r && r.ok && r.holding) {
    // 局部更新: 把反填后的 holding merge 进 holdings
    const list = holdings.value || [];
    const idx = list.findIndex((h) => h && h.code === code);
    if (idx !== -1) {
      const next = [...list];
      next[idx] = r.holding;
      holdings.value = next;
    }
    return { ok: true, holding: r.holding };
  }
  return { ok: false, reason: r && r.reason };
}

export async function fetchNavNow(api) {
  fundsRefreshing.value = true;
  fundsRefreshError.value = null;
  try {
    const r = await api.fundsNavFetch();
    if (r && r.ok) {
      if (r.results || r.errors) {
        navCache.value = {
          fetchedAt: Date.now(),
          data: Object.assign(
            {},
            (navCache.value && navCache.value.data) || {},
            r.results || {},
          ),
          errors: Object.assign(
            {},
            (navCache.value && navCache.value.errors) || {},
            r.errors || {},
          ),
        };
      }
      const count = r.results ? Object.keys(r.results).length : 0;
      import("../recent/track.js").then((m) => m.trackFundNavFetch(count));
      // 不阻塞 UI: 状态/持仓后台同步
      void loadNavState(api);
      void loadFunds(api);
    } else {
      fundsRefreshError.value = (r && r.reason) || '刷新失败';
    }
    return r;
  } catch (err) {
    fundsRefreshError.value = (err && err.message) || '刷新失败';
    return { ok: false, reason: err && err.message };
  } finally {
    fundsRefreshing.value = false;
  }
}

/** 拉单只/少量基金净值, 合并进 navCache (弹窗填码用) */
export async function fetchNavForCodes(api, codes) {
  if (!api || !api.fundsNavFetchCodes) return { ok: false, reason: "no_api" };
  const r = await api.fundsNavFetchCodes(codes);
  if (r && r.ok && (r.results || r.errors)) {
    navCache.value = {
      fetchedAt: Date.now(),
      data: Object.assign(
        {},
        (navCache.value && navCache.value.data) || {},
        r.results || {},
      ),
      errors: Object.assign(
        {},
        (navCache.value && navCache.value.errors) || {},
        r.errors || {},
      ),
    };
  }
  return r;
}

export async function loadNavState(api) {
  try {
    const r = await api.fundsNavState();
    if (r && r.ok) schedulerState.value = r;
  } catch {
    /* noop */
  }
}

export async function loadFundHistory(api) {
  try {
    const r = await api.fundsHistoryList();
    if (r && r.ok) {
      dailySnapshots.value = r.dailySnapshots || [];
    }
  } catch (err) {
    log.warn("loadFundHistory failed:", err && err.message);
  }
}

export function setSelectedHistoryMonth(ym) {
  selectedHistoryMonth.value = ym;
}

export async function setNavSource(api, source) {
  const next = normalizeNavSource(source);
  const prev = navSource.value;
  if (next === prev) return { ok: true, reason: "same" };
  navSource.value = next;
  try {
    await api.fundsSetNavSource(next);
  } catch (err) {
    log.warn("setNavSource failed:", err && err.message);
    return { ok: false, reason: "save_failed" };
  }
  // 2026-07-14 改进: 切换源后立刻主动拉一次, 让 UI 上的估值/涨跌立刻反映新源
  //   不再等下一个 scheduler tick (那样用户看不出切换生效了).
  //   fetchNavNow 已被设计为幂等且不会覆盖 navCache 中已有的跨源合并字段.
  try {
    const r = await fetchNavNow(api);
    return r && r.ok ? { ok: true } : { ok: false, reason: r && r.reason };
  } catch (err) {
    log.warn("setNavSource post-refresh failed:", err && err.message);
    return { ok: false, reason: "refresh_failed" };
  }
}

export async function loadAlertPrefs(api) {
  try {
    const r = await api.fundsAlertPrefsGet();
    if (r && r.ok && r.alertPrefs) {
      alertPrefs.value = {
        enabled: !!r.alertPrefs.enabled,
        profitPct: Number(r.alertPrefs.profitPct) || 10,
        lossPct: Number(r.alertPrefs.lossPct) || -5,
      };
    }
  } catch (err) {
    log.warn("loadAlertPrefs failed:", err && err.message);
  }
}

export async function saveAlertPrefs(api, patch) {
  try {
    const r = await api.fundsAlertPrefsSet(patch);
    if (r && r.ok && r.alertPrefs) {
      alertPrefs.value = {
        enabled: !!r.alertPrefs.enabled,
        profitPct: Number(r.alertPrefs.profitPct) || 10,
        lossPct: Number(r.alertPrefs.lossPct) || -5,
      };
    }
    return r;
  } catch (err) {
    log.warn("saveAlertPrefs failed:", err && err.message);
    return { ok: false };
  }
}

/**
 * 订阅主进程推送. 返回 unsubscribe 函数.
 *  - funds:nav:state → schedulerState
 *  - funds:nav:fetched → navCache (合并: 替换 code 对应 data + errors)
 */
export function subscribeNavUpdates(api) {
  const offState = api.onFundsNavState((st) => {
    schedulerState.value = st;
  });
  const offFetched = api.onFundsNavFetched((payload) => {
    if (!payload) return;
    navCache.value = {
      fetchedAt: payload.fetchedAt,
      data: Object.assign(
        {},
        (navCache.value && navCache.value.data) || {},
        payload.results || {},
      ),
      errors: Object.assign(
        {},
        (navCache.value && navCache.value.errors) || {},
        payload.errors || {},
      ),
    };
    void loadFundHistory(api);
  });
  const offHistory =
    api.onFundsHistoryUpdated &&
    api.onFundsHistoryUpdated((payload) => {
      if (payload && Array.isArray(payload.dailySnapshots)) {
        dailySnapshots.value = payload.dailySnapshots;
      } else {
        void loadFundHistory(api);
      }
    });
  const offSidenavBadge =
    api.onSidenavBadge &&
    api.onSidenavBadge((payload) => {
      if (payload && payload.key === "funds") {
        bumpFundNavBadge(payload.count || 1);
      }
    });
  return () => {
    try {
      offState && offState();
    } catch {
      /* noop */
    }
    try {
      offFetched && offFetched();
    } catch {
      /* noop */
    }
    try {
      offHistory && offHistory();
    } catch {
      /* noop */
    }
    try {
      offSidenavBadge && offSidenavBadge();
    } catch {
      /* noop */
    }
  };
}

// ── NAV history cache (新接口 funds:nav:history) ──
export const navHistoryCache = signal({}); // { [code]: { series, loadedAt } }
// 2026-07-15: per-code 加载状态 — 给 FundDetail 完整度指示用
//   ponytail: 不用全局 loading (会误报别的基金在拉), 用 Map[code] = bool
export const navHistoryLoading = signal({}); // { [code]: true }

export const categoryAllocation = computed(() => {
  const rows = rowsWithMetrics.value || [];
  const acc = { stock: 0, bond: 0, money: 0, qdii: 0, other: 0 };
  let total = 0;
  for (const r of rows) {
    const cat = (r.holding && r.holding.category) || "other";
    const mv = (r.metrics && r.metrics.marketValue) || 0;
    acc[cat] = (acc[cat] || 0) + mv;
    total += mv;
  }
  return { byCategory: acc, total };
});
// 2026-07-14: 持仓权重 map — 给 List / Dashboard 行 tint 用
//   ponytail: 行 tint 需要"这只基金占整个组合多少 %", total=0 时 map 为空
export const holdingWeights = computed(() => {
  const rows = rowsWithMetrics.value || [];
  const m = {};
  let total = 0;
  for (const r of rows) {
    const mv = (r.metrics && r.metrics.marketValue) || 0;
    const code = r.holding && r.holding.code;
    if (code) m[code] = mv;
    total += mv;
  }
  if (total <= 0) return { byCode: {}, total: 0, maxWeight: 0 };
  // 第二遍: 算百分比 + 找最大
  let maxWeight = 0;
  for (const code in m) {
    m[code] = m[code] / total;
    if (m[code] > maxWeight) maxWeight = m[code];
  }
  return { byCode: m, total, maxWeight };
});

// ── T-C1c: 基准指数叠加 (沪深300 默认) ──
export const DEFAULT_BENCHMARK = "000300";
export const benchmarkEnabled = signal(true);
export const indexHistoryCache = signal({}); // { [symbol]: [{ date, value }] }
export const benchmarkError = signal(null);

let indexHistoryLoading = false; // 并发保护

export async function loadIndexHistory(api, symbol) {
  const sym = symbol || DEFAULT_BENCHMARK;
  if (indexHistoryLoading) return { ok: false, reason: "in_flight" };
  const cached = indexHistoryCache.value[sym];
  if (cached && cached.length) return { ok: true, series: cached, cached: true };
  indexHistoryLoading = true;
  benchmarkError.value = null;
  try {
    const r = await api.fundsIndexHistory(sym, { days: 365 });
    if (r && r.ok && Array.isArray(r.series) && r.series.length) {
      indexHistoryCache.value = Object.assign({}, indexHistoryCache.value, {
        [sym]: r.series,
      });
      return { ok: true, series: r.series };
    }
    const reason = (r && r.reason) || "unknown";
    benchmarkError.value = reason;
    return { ok: false, reason };
  } catch (err) {
    const reason = (err && err.message) ? err.message : String(err);
    benchmarkError.value = reason;
    return { ok: false, reason };
  } finally {
    indexHistoryLoading = false;
  }
}

// 2026-07-15: 默认拉取窗口 = 90 天, 覆盖 1M/3M (用户高频区间)
//   ponytail: 用户反馈「切 3M 数据不足」— 30 天不够, 但 365 全量又太重 (10s+),
//             选 90 天作为 90% 场景的甜点; 切 6M/1Y/ALL 时再补拉
//             备选: 365 (慢) / 90 (快, 缺数据时补拉) — 这里选后者
const NAV_HISTORY_DEFAULT_DAYS = 90;
// 单次请求上限, eastmoney 实际允许更大 (5000/10000), 用 9999 保险
const NAV_HISTORY_MAX_PAGE_SIZE = 9999;

export async function loadFundNavHistory(api, code, opts = {}) {
  if (!code) return { ok: false };
  const cached = navHistoryCache.value[code];
  // 2026-07-15: 缓存够用 / 已按同样天数拉过 → 直接返回
  //   ponytail: fetchedDays 防「基金上市不足一年」时反复补拉同一窗口
  const requestedDays = Math.max(
    Number(opts.days) || NAV_HISTORY_DEFAULT_DAYS,
    NAV_HISTORY_DEFAULT_DAYS,
  );
  const haveRows = cached && cached.series && cached.series.length >= requestedDays;
  // 2026-07-15: series===20 且 fetchedDays>20 → 脏标记 (东财单页上限陷阱), 允许重拉
  const looksLikeStalePageCap =
    cached &&
    cached.series &&
    cached.series.length === 20 &&
    (cached.fetchedDays || 0) > 20;
  const alreadyTried =
    !looksLikeStalePageCap &&
    cached &&
    (cached.fetchedDays || 0) >= requestedDays;
  if (haveRows || alreadyTried) {
    return { ok: true, series: (cached && cached.series) || [], cached: true };
  }
  navHistoryLoading.value = Object.assign({}, navHistoryLoading.value, {
    [code]: true,
  });
  try {
    const pageSize = Math.min(
      Math.max(requestedDays, NAV_HISTORY_DEFAULT_DAYS),
      NAV_HISTORY_MAX_PAGE_SIZE,
    );
    const r = await api.fundsNavHistory(code, { days: pageSize });
    if (r && r.ok && r.series) {
      const prev = (cached && cached.series) || [];
      // 主进程可能仍吐旧短缓存; 取较长那份
      const series = r.series.length >= prev.length ? r.series : prev;
      // 2026-07-15: 只有真正网络拉取成功才抬 fetchedDays
      //   ponytail: 旧逻辑在 cached 短回退时也写成 pageSize, 导致 1Y 被「已试过」钉死
      const nextFetched = r.cached
        ? (cached && cached.fetchedDays) || 0
        : Math.max((cached && cached.fetchedDays) || 0, pageSize);
      navHistoryCache.value = Object.assign({}, navHistoryCache.value, {
        [code]: {
          series,
          loadedAt: Date.now(),
          fetchedDays: nextFetched,
        },
      });
      return { ok: true, series };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    return { ok: false, reason: err && err.message };
  } finally {
    const next = Object.assign({}, navHistoryLoading.value);
    delete next[code];
    navHistoryLoading.value = next;
  }
}

// ── 批量 NAV history 预拉 (并发限流, 仅未缓存) ──
const NAV_PREFETCH_CONCURRENCY = 3;
let navPrefetchRunning = false;

export async function prefetchAllNavHistory(api, { concurrency = NAV_PREFETCH_CONCURRENCY } = {}) {
  if (navPrefetchRunning) return;
  const codes = (holdings.value || [])
    .map((h) => h && h.code)
    .filter(Boolean)
    .filter((code) => {
      const c = navHistoryCache.value[code];
      return !(c && c.series && c.series.length);
    });
  if (!codes.length) return;
  navPrefetchRunning = true;
  try {
    let idx = 0;
    const worker = async () => {
      while (idx < codes.length) {
        const code = codes[idx++];
        await loadFundNavHistory(api, code);
      }
    };
    const poolSize = Math.min(concurrency, codes.length);
    await Promise.all(Array.from({ length: poolSize }, worker));
  } finally {
    navPrefetchRunning = false;
  }
}
