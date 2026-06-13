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
export const addModalOpen = signal(false);
export const editingHolding = signal(null);
export const dailySnapshots = signal([]);
export const selectedHistoryMonth = signal(ymShanghai(new Date()));
export const navSource = signal(DEFAULT_NAV_SOURCE);
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
 * 按 category 过滤 + 搜索过滤 — 给 FundList 用
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

// ── async actions (走 IPC) ──

export async function loadFunds(api) {
  try {
    const r = await api.fundsList();
    if (r && r.ok) {
      holdings.value = r.holdings || [];
      navSource.value = normalizeNavSource(r.navSource);
    } else {
      holdings.value = [];
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[funds] loadFunds failed:", err && err.message);
    holdings.value = [];
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
  }
  return r;
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
    // eslint-disable-next-line no-console
    console.warn("[funds] loadFundHistory failed:", err && err.message);
  }
}

export function setSelectedHistoryMonth(ym) {
  selectedHistoryMonth.value = ym;
}

export async function setNavSource(api, source) {
  const next = normalizeNavSource(source);
  navSource.value = next;
  try {
    await api.fundsSetNavSource(next);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[funds] setNavSource failed:", err && err.message);
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
  };
}
