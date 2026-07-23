/**
 * src/main/funds/fund-store.ts
 *
 * 基金持仓持久化 —— 跟 state-store.js 平级, 复用 writeAtomic.
 *
 * 数据 schema (state.json.funds):
 *   {
 *     holdings: FundHolding[],         // 用户持仓
 *     deletedIds: DeletedHolding[],    // 软删, 7 天 GC
 *     dailySnapshots: DailySnapshot[], // 每日盈亏快照
 *     navSource: 'tiantian' | 'sina',   // 估值数据源 (用户切换)
 *     alertPrefs: { enabled, profitPct, lossPct, lastNotified }  // I8 盈亏阈值提醒
 *   }
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const stateStore = require("../state-store.ts");

const FUNDS_DELETED_GC_DAYS = 7;
const FUNDS_DELETED_GC_MS = FUNDS_DELETED_GC_DAYS * 24 * 60 * 60 * 1000;

const VALID_CATEGORIES = ["stock", "bond", "money", "qdii", "other"];
const { isValidSnapshot } = require("../../funds/fund-history");
const {
  normalizeNavSource,
  DEFAULT_NAV_SOURCE,
} = require("../../funds/fund-nav-merge");
const { normalizeAlertPrefs } = require("./fund-alerts");

export function loadAll(statePath?: any): any {
  const s = stateStore.load(statePath);
  if (!s) return { holdings: [], deletedIds: [] };
  return normalizeFunds(s.funds);
}

export function saveAll(patch: any, statePath?: any): any {
  const existing = stateStore.load(statePath);
  const cur = normalizeFunds(existing && existing.funds);
  const next = {
    holdings: Array.isArray(patch && patch.holdings)
      ? patch.holdings
      : cur.holdings,
    deletedIds: Array.isArray(patch && patch.deletedIds)
      ? patch.deletedIds
      : cur.deletedIds,
    dailySnapshots:
      patch && patch.dailySnapshots !== undefined
        ? patch.dailySnapshots
        : cur.dailySnapshots,
    navSource:
      patch && patch.navSource !== undefined
        ? normalizeNavSource(patch.navSource)
        : cur.navSource,
    alertPrefs:
      patch && patch.alertPrefs !== undefined
        ? normalizeAlertPrefs(patch.alertPrefs)
        : cur.alertPrefs,
  };
  next.deletedIds = cleanExpiredDeleted(next.deletedIds);

  const nextState = Object.assign({}, existing || {}, {
    v: (existing && existing.v) || stateStore.SCHEMA_VERSION,
    ts: Date.now(),
    funds: next,
  });
  stateStore.writeAtomic(statePath || stateStore.defaultPath(), nextState);
  return next;
}

export function add(input: any, statePath?: any): any {
  const holding = validateAndFill(input);
  const cur = loadAll(statePath);
  if (cur.holdings.some((h: any) => h.code === holding.code)) {
    throw new ValidationError(`fund code ${holding.code} already exists`);
  }
  cur.holdings.push(holding);
  const saved = saveAll(cur, statePath);
  return { holding, all: saved };
}

export function update(id: string, patch: any, statePath?: any): any {
  const cur = loadAll(statePath);
  const idx = cur.holdings.findIndex((h: any) => h && h.id === id);
  if (idx === -1) return null;
  const next = validatePatch(cur.holdings[idx], patch || {});
  cur.holdings[idx] = next;
  const saved = saveAll(cur, statePath);
  return { holding: next, all: saved };
}

export function remove(id: string, statePath?: any): any {
  const cur = loadAll(statePath);
  const idx = cur.holdings.findIndex((h: any) => h && h.id === id);
  if (idx === -1) return { ok: false, reason: "not_found" };
  const removed = cur.holdings[idx];
  cur.holdings.splice(idx, 1);
  if (!cur.deletedIds.some((d: any) => d && d.id === id)) {
    cur.deletedIds.push({
      id,
      code: removed.code,
      name: removed.name,
      deletedAt: Date.now(),
    });
  }
  const saved = saveAll(cur, statePath);
  return { ok: true, all: saved };
}

export function restore(id: string, statePath?: any): any {
  const cur = loadAll(statePath);
  const idx = cur.deletedIds.findIndex((d: any) => d && d.id === id);
  if (idx === -1) return { ok: false, reason: "not_found" };
  const tombed = cur.deletedIds[idx];
  cur.deletedIds.splice(idx, 1);
  const holding = {
    id,
    code: tombed.code,
    name: tombed.name,
    category: "other",
    shares: 0,
    costNav: 0,
    addedAt: Date.now(),
    note: undefined,
    _restored: true,
  };
  cur.holdings.push(holding);
  saveAll(cur, statePath);
  return { ok: true, holding };
}

export function cleanExpiredDeleted(deletedIds: any, now: number = Date.now()): any[] {
  if (!Array.isArray(deletedIds)) return [];
  return deletedIds.filter(
    (d: any) => d && d.deletedAt && now - d.deletedAt < FUNDS_DELETED_GC_MS,
  );
}

function setNavSource(source: any, statePath?: any): any {
  const cur = loadAll(statePath);
  cur.navSource = normalizeNavSource(source);
  return saveAll(cur, statePath);
}

function normalizeFunds(raw: any): any {
  const out = {
    holdings: [],
    deletedIds: [],
    dailySnapshots: [],
    navSource: DEFAULT_NAV_SOURCE,
    alertPrefs: normalizeAlertPrefs(null),
  };
  if (!raw || typeof raw !== "object") return out;
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

export function setAlertPrefs(patch: any, statePath?: any): any {
  const cur = loadAll(statePath);
  const nextPrefs = normalizeAlertPrefs(
    Object.assign({}, cur.alertPrefs, patch),
  );
  return saveAll(
    {
      holdings: cur.holdings,
      deletedIds: cur.deletedIds,
      dailySnapshots: cur.dailySnapshots,
      navSource: cur.navSource,
      alertPrefs: nextPrefs,
    },
    statePath,
  );
}

function isValidHolding(h: any): boolean {
  return h && typeof h.id === "string" && /^\d{6}$/.test(String(h.code || ""));
}

function isValidDeleted(d: any): boolean {
  return d && typeof d.id === "string" && typeof d.deletedAt === "number";
}

function validateAndFill(input: any): any {
  if (!input || typeof input !== "object") {
    throw new ValidationError("holding must be an object");
  }
  const code = String(input.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new ValidationError(`invalid fund code: ${input.code}`);
  }
  const shares = Number(input.shares);
  if (!Number.isFinite(shares) || shares < 0) {
    throw new ValidationError(`shares must be >= 0, got ${input.shares}`);
  }
  const costNav = Number(input.costNav);
  if (!Number.isFinite(costNav) || costNav < 0) {
    throw new ValidationError(`costNav must be >= 0, got ${input.costNav}`);
  }
  const category = VALID_CATEGORIES.includes(input.category)
    ? input.category
    : "other";
  const name =
    typeof input.name === "string" && input.name.length > 0
      ? input.name
      : `基金 ${code}`;
  const note =
    typeof input.note === "string" && input.note.length > 0
      ? input.note
      : undefined;
  const amount = input._amount;
  const validAmount =
    amount != null && Number.isFinite(Number(amount)) && Number(amount) > 0
      ? Number(amount)
      : undefined;
  const pendingNav = !!(costNav === 0 && validAmount);
  const out = {
    id:
      typeof input.id === "string" && input.id.length > 0 ? input.id : genId(),
    code,
    name,
    category,
    shares,
    costNav,
    addedAt: typeof input.addedAt === "number" ? input.addedAt : Date.now(),
    note,
  };
  if (validAmount !== undefined) (out as any)._amount = validAmount;
  if (pendingNav) (out as any)._pendingNav = true;
  return out;
}

function validatePatch(prev: any, patch: any): any {
  const next = Object.assign({}, prev, patch);
  return validateAndFill(next);
}

function genId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ValidationError";
  }
}

export function backfillFromNav(code: string, latestNav: number, statePath?: any): any {
  if (!/^\d{6}$/.test(String(code || "")))
    return { ok: false, reason: "invalid_code" };
  const nav = Number(latestNav);
  if (!Number.isFinite(nav) || nav <= 0)
    return { ok: false, reason: "invalid_nav" };

  const cur = loadAll(statePath);
  const idx = cur.holdings.findIndex((h: any) => h && h.code === code);
  if (idx === -1) return { ok: false, reason: "not_found" };

  const h = cur.holdings[idx];
  if (Number(h.costNav) > 0) return { ok: false, reason: "already_filled" };
  const amount = Number(h._amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, reason: "no_amount" };

  const newShares = amount / nav;
  const next = Object.assign({}, h, {
    shares: newShares,
    costNav: nav,
    _pendingNav: false,
  });
  cur.holdings[idx] = next;
  const saved = saveAll(cur, statePath);
  return { ok: true, holding: next, all: saved };
}

module.exports = {
  loadAll,
  saveAll,
  setNavSource,
  setAlertPrefs,
  add,
  update,
  remove,
  restore,
  cleanExpiredDeleted,
  backfillFromNav,
  FUNDS_DELETED_GC_DAYS,
  VALID_CATEGORIES,
  ValidationError,
};
