/**
 * src/main/funds/fund-history-store.ts
 *
 * 基金每日盈亏快照持久化 (state.json.funds.dailySnapshots).
 */
"use strict";

const stateStore = require("../state-store.ts");
const fundStore = require("./fund-store.ts");
const {
  ymdShanghai,
  isValidSnapshot,
  buildSnapshotFromMetrics,
  upsertDailySnapshot,
  pruneSnapshots,
} = require("../../funds/fund-history");
const {
  calcPortfolioTotal,
  zipHoldingsWithNav,
  rowWithMetrics,
} = require("../../funds/fundCalc");
const { resolveNavSnapshot } = require("../../funds/fund-nav-merge");

export function loadSnapshots(statePath: any): any[] {
  const s = stateStore.load(statePath);
  const raw = s && s.funds && s.funds.dailySnapshots;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidSnapshot);
}

export function saveSnapshots(snapshots: any[], statePath: any): any {
  const existing = stateStore.load(statePath) || {};
  const funds =
    existing.funds && typeof existing.funds === "object"
      ? { ...existing.funds }
      : {};
  const cur = fundStore.loadAll(statePath);
  funds.holdings = cur.holdings;
  funds.deletedIds = cur.deletedIds;
  funds.dailySnapshots = pruneSnapshots(snapshots);
  funds.navSource = cur.navSource;

  const nextState = Object.assign({}, existing, {
    v: existing.v || stateStore.SCHEMA_VERSION,
    ts: Date.now(),
    funds,
  });
  stateStore.writeAtomic(statePath || stateStore.defaultPath(), nextState);
  return funds.dailySnapshots;
}

/**
 * 净值拉取成功后写入/更新当天快照.
 */
export function recordFromNavMap(navMap: any, now: Date = new Date(), statePath?: any): any {
  const { holdings, navSource } = fundStore.loadAll(statePath);
  if (!holdings || holdings.length === 0) {
    return { ok: false, reason: "empty_holdings" };
  }
  if (
    !navMap ||
    typeof navMap !== "object" ||
    Object.keys(navMap).length === 0
  ) {
    return { ok: false, reason: "empty_nav" };
  }

  const rows = zipHoldingsWithNav(holdings, navMap).map((row: any) => {
    const resolved = resolveNavSnapshot(row.navSnap, navSource);
    return rowWithMetrics({ holding: row.holding, navSnap: resolved });
  });
  const totals = calcPortfolioTotal(rows);
  if (totals.countWithNav === 0) {
    return { ok: false, reason: "no_nav_data" };
  }

  const date = ymdShanghai(now);
  const entry = buildSnapshotFromMetrics(date, totals, Date.now());
  const cur = loadSnapshots(statePath);
  const next = upsertDailySnapshot(cur, entry);
  const saved = saveSnapshots(next, statePath);
  return { ok: true, entry, dailySnapshots: saved };
}

export function loadNavHistory(code: string, statePath: any): any[] {
  const s = stateStore.load(statePath);
  const map = s && s.funds && s.funds.navHistory;
  return map && Array.isArray(map[code]) ? map[code] : [];
}

/**
 * 磁盘缓存是否够撑本次请求窗口.
 * 2026-07-15: 旧逻辑「有数组就命中」导致 30 天短缓存永久挡住 3M/1Y.
 */
export function isNavCacheSufficient(cached: any, requestedDays: number): boolean {
  const need = Math.max(1, Number(requestedDays) || 0);
  return Array.isArray(cached) && cached.length >= need;
}

export function saveNavHistory(code: string, series: any, statePath: any): boolean {
  const s = stateStore.load(statePath) || {};
  s.funds = s.funds && typeof s.funds === "object" ? s.funds : {};
  s.funds.navHistory =
    s.funds.navHistory && typeof s.funds.navHistory === "object"
      ? s.funds.navHistory
      : {};
  s.funds.navHistory[code] = Array.isArray(series) ? series : [];
  stateStore.writeAtomic(statePath || stateStore.defaultPath(), s);
  return true;
}

export function loadIndexHistory(symbol: string, statePath: any): any[] {
  const s = stateStore.load(statePath);
  const map = s && s.funds && s.funds.indexHistory;
  return map && Array.isArray(map[symbol]) ? map[symbol] : [];
}

export function saveIndexHistory(symbol: string, series: any, statePath: any): boolean {
  const s = stateStore.load(statePath) || {};
  s.funds = s.funds && typeof s.funds === "object" ? s.funds : {};
  s.funds.indexHistory =
    s.funds.indexHistory && typeof s.funds.indexHistory === "object"
      ? s.funds.indexHistory
      : {};
  s.funds.indexHistory[symbol] = Array.isArray(series) ? series : [];
  stateStore.writeAtomic(statePath || stateStore.defaultPath(), s);
  return true;
}

module.exports = {
  loadSnapshots,
  saveSnapshots,
  recordFromNavMap,
  loadNavHistory,
  saveNavHistory,
  isNavCacheSufficient,
  loadIndexHistory,
  saveIndexHistory,
};
