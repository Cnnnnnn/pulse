/**
 * src/main/worldcup/bets-store.js
 *
 * v2.10.0 世界杯体彩记账 store
 *
 * 沿用 fund-store.js 的模式:
 *   - 走 state-store.load / writeAtomic (同进程复用, 跟 funds 同一套 atomic write)
 *   - 顶层 state.json.worldcupBets[key] = entry, key = match.date (YYYY-MM-DD)
 *   - 输入校验
 */

const fs = require("fs");
const stateStore = require("../state-store.ts");
const { mainLog } = require("../log.ts");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE_LEN = 200;
const MAX_NUM = 1e9;

/**
 * 读 state.json, 不依赖 stateStore.load (后者要求 apps 字段,
 * 用户首次写体彩时 state.json 还没有 apps — 拿到 null).
 */
function _readStateRaw(statePath) {
  const p = statePath || stateStore.defaultPath();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return {};
    return j;
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    mainLog.warn("[bets-store] state read failed, treating as empty", {
      msg: err && err.message,
    });
    return {};
  }
}

function _validateInput(input) {
  if (!input || typeof input !== "object") {
    const err = new Error("invalid_input");
    err.code = "invalid_input";
    throw err;
  }
  const { date, stake, pnl, note = "" } = input;
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    const err = new Error("invalid_date");
    err.code = "invalid_date";
    throw err;
  }
  if (
    typeof stake !== "number" ||
    !Number.isFinite(stake) ||
    stake < 0 ||
    stake > MAX_NUM
  ) {
    const err = new Error("invalid_stake");
    err.code = "invalid_stake";
    throw err;
  }
  if (
    typeof pnl !== "number" ||
    !Number.isFinite(pnl) ||
    pnl > MAX_NUM ||
    pnl < -MAX_NUM
  ) {
    const err = new Error("invalid_pnl");
    err.code = "invalid_pnl";
    throw err;
  }
  if (typeof note !== "string" || note.length > MAX_NOTE_LEN) {
    const err = new Error("invalid_note");
    err.code = "invalid_note";
    throw err;
  }
}

function loadAll(statePath) {
  const existing = _readStateRaw(statePath);
  if (!existing) return { worldcupBets: {} };
  return { worldcupBets: existing.worldcupBets || {} };
}

/** 保证 state.json 带 apps/mutes, 避免 load() 读不到后 saveAll 覆盖体彩 */
function _withStateShell(raw) {
  const base = raw && typeof raw === "object" ? { ...raw } : {};
  if (!base.v) base.v = stateStore.SCHEMA_VERSION;
  if (!base.apps || typeof base.apps !== "object") base.apps = {};
  if (!base.mutes || typeof base.mutes !== "object") base.mutes = {};
  return base;
}

function upsert(input, statePath) {
  _validateInput(input);
  const path = statePath || stateStore.defaultPath();
  const existing = _withStateShell(_readStateRaw(path));
  const worldcupBets = { ...(existing.worldcupBets || {}) };
  const entry = {
    date: input.date,
    stake: input.stake,
    pnl: input.pnl,
    note: input.note || "",
    updatedAt: Date.now(),
  };
  worldcupBets[input.date] = entry;
  const next = { ...existing, worldcupBets };
  stateStore.writeAtomic(path, next);
  return { ok: true, entry };
}

function remove(date, statePath) {
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return { ok: false, reason: "invalid_date" };
  }
  const path = statePath || stateStore.defaultPath();
  const existing = _withStateShell(_readStateRaw(path));
  if (!existing.worldcupBets || !existing.worldcupBets[date]) {
    return { ok: false, reason: "not_found" };
  }
  const worldcupBets = { ...existing.worldcupBets };
  delete worldcupBets[date];
  const next = { ...existing, worldcupBets };
  stateStore.writeAtomic(path, next);
  return { ok: true };
}

module.exports = { loadAll, upsert, remove, _validateInput };
