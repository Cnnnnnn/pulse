/**
 * 基金持仓持久化 Repository。
 *
 * fund-store 负责持仓操作和业务校验；本模块负责 state.json.funds 的
 * 读取、规范化、软删 GC 与原子保存。这样冷启动、坏数据和写盘兼容性
 * 有一个稳定的边界，后续可独立迁移到领域存储。
 */

import * as stateStore from "../state-store";
import { isValidSnapshot } from "../../funds/fund-history";
const {
  normalizeNavSource,
  DEFAULT_NAV_SOURCE,
} = require("../../funds/fund-nav-merge.js");
import { normalizeAlertPrefs } from "./fund-alerts";

export const FUNDS_DELETED_GC_DAYS = 7;
export const FUNDS_DELETED_GC_MS =
  FUNDS_DELETED_GC_DAYS * 24 * 60 * 60 * 1000;

export type FundState = {
  holdings: any[];
  deletedIds: any[];
  dailySnapshots: any[];
  navSource: string;
  alertPrefs: any;
};

function emptyFunds(): FundState {
  return {
    holdings: [],
    deletedIds: [],
    dailySnapshots: [],
    navSource: DEFAULT_NAV_SOURCE,
    alertPrefs: normalizeAlertPrefs(null),
  };
}

function isValidHolding(holding: any): boolean {
  return (
    holding &&
    typeof holding.id === "string" &&
    /^\d{6}$/.test(String(holding.code || ""))
  );
}

function isValidDeleted(deleted: any): boolean {
  return (
    deleted &&
    typeof deleted.id === "string" &&
    typeof deleted.deletedAt === "number"
  );
}

export function normalizeFunds(raw: any): FundState {
  const out = emptyFunds();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  if (Array.isArray(raw.holdings)) {
    out.holdings = raw.holdings.filter(isValidHolding);
  }
  if (Array.isArray(raw.deletedIds)) {
    out.deletedIds = raw.deletedIds.filter(isValidDeleted);
  }
  if (Array.isArray(raw.dailySnapshots)) {
    out.dailySnapshots = raw.dailySnapshots.filter(isValidSnapshot);
  }
  out.navSource = normalizeNavSource(raw.navSource);
  out.alertPrefs = normalizeAlertPrefs(raw.alertPrefs);
  return out;
}

export function load(statePath?: any): FundState {
  const state = stateStore.load(statePath);
  return normalizeFunds(state && state.funds);
}

export function cleanExpiredDeleted(
  deletedIds: any,
  now: number = Date.now(),
): any[] {
  if (!Array.isArray(deletedIds)) return [];
  return deletedIds.filter(
    (deleted: any) =>
      deleted &&
      deleted.deletedAt &&
      now - deleted.deletedAt < FUNDS_DELETED_GC_MS,
  );
}

export function save(patch: any, statePath?: any): FundState {
  const current = load(statePath);
  const next: FundState = {
    holdings: Array.isArray(patch && patch.holdings)
      ? patch.holdings
      : current.holdings,
    deletedIds: Array.isArray(patch && patch.deletedIds)
      ? patch.deletedIds
      : current.deletedIds,
    dailySnapshots:
      patch && patch.dailySnapshots !== undefined
        ? patch.dailySnapshots
        : current.dailySnapshots,
    navSource:
      patch && patch.navSource !== undefined
        ? normalizeNavSource(patch.navSource)
        : current.navSource,
    alertPrefs:
      patch && patch.alertPrefs !== undefined
        ? normalizeAlertPrefs(patch.alertPrefs)
        : current.alertPrefs,
  };
  next.deletedIds = cleanExpiredDeleted(next.deletedIds);

  stateStore.patchState((nextState: any) => {
    nextState.funds = next;
  }, statePath);
  return next;
}

module.exports = {
  FUNDS_DELETED_GC_DAYS,
  FUNDS_DELETED_GC_MS,
  normalizeFunds,
  load,
  cleanExpiredDeleted,
  save,
};
