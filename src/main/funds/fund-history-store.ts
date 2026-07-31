/**
 * src/main/funds/fund-history-store.ts
 *
 * 基金每日盈亏快照持久化 (state.json.funds.dailySnapshots).
 */
"use strict";

import * as stateStore from "../state-store";
import * as fundStore from "./fund-store";
const {
  ymdShanghai,
  isValidSnapshot,
  buildSnapshotFromMetrics,
  upsertDailySnapshot,
  pruneSnapshots,
} = require("../../funds/fund-history.js");
const {
  calcPortfolioTotal,
  zipHoldingsWithNav,
  rowWithMetrics,
} = require("../../funds/fundCalc.js");
import { resolveNavSnapshot } from "../../funds/fund-nav-merge";

export function loadSnapshots(statePath: any = stateStore.defaultPath()): any[] {
  const s = stateStore.load(statePath);
  const raw = s && s.funds && s.funds.dailySnapshots;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidSnapshot);
}

function saveSnapshots(snapshots: any[], statePath: any): any {
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
 * 从 navMap 里取数据对应的最新交易日 (YYYY-MM-DD).
 * 多基金时取最新日期 (避免 QDII/T+1 等慢一拍的基金把快照钉在旧交易日).
 * 没有有效 navDate → null (调用方回退到记录时刻日期).
 */
export function pickTradeDate(navMap: any): string | null {
  if (!navMap || typeof navMap !== "object") return null;
  let best: string | null = null;
  for (const snap of Object.values(navMap) as any[]) {
    const d = snap && snap.navDate;
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (best == null || d > best) best = d;
    }
  }
  return best;
}

/**
 * 净值拉取成功后写入/更新当天快照.
 *
 * 口径 (2026-08-01 修订):
 *   - 快照日期 = navMap 数据对应的交易日 (navDate), 不是记录时刻日期.
 *     非交易时段 (周末/收盘后) 拉取会补/覆盖该交易日快照, 不产生重复的 0 值记录.
 *   - todayProfit 用 gateToday=false 口径: 非交易时段也按数据源涨跌记录
 *     "最近交易日盈亏", 避免历史盈亏记录大片 0.
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
  const totals = calcPortfolioTotal(rows, { gateToday: false });
  if (totals.countWithNav === 0) {
    return { ok: false, reason: "no_nav_data" };
  }

  const date = pickTradeDate(navMap) || ymdShanghai(now);
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

  recordFromNavMap,
  pickTradeDate,
  loadNavHistory,
  saveNavHistory,
  isNavCacheSufficient,
  loadIndexHistory,
  saveIndexHistory,
};
