/**
 * src/main/fund-store.js
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
 *
 * 设计原则:
 *   - 软删: 误删 7 天可恢复 (deletedAt 戳, GC 时清理)
 *   - atomic write: 复用 state-store.writeAtomic, 不丢其他字段
 *   - 兜底: 文件不存在 / 解析失败 → 返回空 holdings + 空 deletedIds
 *   - validation: 输入字段做白名单校验 (拒绝 code 非 6 位、shares < 0 等)
 *
 * v1.0 (2026-06-12) — 初版
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const stateStore = require("../state-store");

const FUNDS_DELETED_GC_DAYS = 7;
const FUNDS_DELETED_GC_MS = FUNDS_DELETED_GC_DAYS * 24 * 60 * 60 * 1000;

const VALID_CATEGORIES = ["stock", "bond", "money", "qdii", "other"];
const { isValidSnapshot } = require("../../funds/fund-history");
const {
  normalizeNavSource,
  DEFAULT_NAV_SOURCE,
} = require("../../funds/fund-nav-merge");
const { normalizeAlertPrefs } = require("./fund-alerts");

/**
 * 读 holdings + deletedIds. 文件不存在 / 解析失败 → 兜底空.
 *
 * @param {string} [statePath]
 * @returns {{ holdings: FundHolding[], deletedIds: DeletedHolding[] }}
 */
function loadAll(statePath) {
  const s = stateStore.load(statePath);
  if (!s) return { holdings: [], deletedIds: [] };
  return normalizeFunds(s.funds);
}

/**
 * 把 holdings + deletedIds merge 进现有 state 并落盘.
 *
 * @param {{ holdings?: FundHolding[], deletedIds?: DeletedHolding[] }} patch
 * @param {string} [statePath]
 * @returns {{ holdings: FundHolding[], deletedIds: DeletedHolding[] }}
 */
function saveAll(patch, statePath) {
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
  // GC: 清掉超期 deleted
  next.deletedIds = cleanExpiredDeleted(next.deletedIds);

  const nextState = Object.assign({}, existing || {}, {
    v: (existing && existing.v) || stateStore.SCHEMA_VERSION,
    ts: Date.now(),
    funds: next,
  });
  // 保留 apps / mutes / last_opened / active_category / classify_llm_cache / task_summaries / worldcup_*
  // (stateStore.saveAll / preserveExtraFields 自动处理; 这里直接复用 writeAtomic)
  stateStore.writeAtomic(statePath || stateStore.defaultPath(), nextState);
  return next;
}

/**
 * 添加一条持仓. 自动生成 id, 校验字段.
 *
 * @param {Partial<FundHolding>} input
 * @param {string} [statePath]
 * @returns {{ holding: FundHolding, all: { holdings, deletedIds } }}
 * @throws {ValidationError}
 */
function add(input, statePath) {
  const holding = validateAndFill(input);
  const cur = loadAll(statePath);
  // 同 code 已存在 → 拒绝 (UI 应该走 update)
  if (cur.holdings.some((h) => h.code === holding.code)) {
    throw new ValidationError(`fund code ${holding.code} already exists`);
  }
  cur.holdings.push(holding);
  const saved = saveAll(cur, statePath);
  return { holding, all: saved };
}

/**
 * 更新一条持仓. 按 id 找.
 *
 * @param {string} id
 * @param {Partial<FundHolding>} patch
 * @param {string} [statePath]
 * @returns {{ holding: FundHolding, all: { holdings, deletedIds } } | null}
 */
function update(id, patch, statePath) {
  const cur = loadAll(statePath);
  const idx = cur.holdings.findIndex((h) => h && h.id === id);
  if (idx === -1) return null;
  const next = validatePatch(cur.holdings[idx], patch || {});
  cur.holdings[idx] = next;
  const saved = saveAll(cur, statePath);
  return { holding: next, all: saved };
}

/**
 * 软删一条持仓. 进 deletedIds, 7 天 GC.
 *
 * @param {string} id
 * @param {string} [statePath]
 * @returns {{ ok: true, all: { holdings, deletedIds } } | { ok: false, reason: string }}
 */
function remove(id, statePath) {
  const cur = loadAll(statePath);
  const idx = cur.holdings.findIndex((h) => h && h.id === id);
  if (idx === -1) return { ok: false, reason: "not_found" };
  const removed = cur.holdings[idx];
  cur.holdings.splice(idx, 1);
  // 已删除的跳过 (幂等)
  if (!cur.deletedIds.some((d) => d && d.id === id)) {
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

/**
 * 恢复一条软删 (7 天内). 恢复时不保留 shares/costNav (UI 重新填).
 *
 * @param {string} id
 * @param {string} [statePath]
 * @returns {{ ok: true, holding: FundHolding } | { ok: false, reason: string }}
 */
function restore(id, statePath) {
  const cur = loadAll(statePath);
  const idx = cur.deletedIds.findIndex((d) => d && d.id === id);
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

/**
 * 清掉超期 deletedIds (默认 7 天).
 */
function cleanExpiredDeleted(deletedIds, now = Date.now()) {
  if (!Array.isArray(deletedIds)) return [];
  return deletedIds.filter(
    (d) => d && d.deletedAt && now - d.deletedAt < FUNDS_DELETED_GC_MS,
  );
}

// ── 内部 ──

function setNavSource(source, statePath) {
  const cur = loadAll(statePath);
  cur.navSource = normalizeNavSource(source);
  return saveAll(cur, statePath);
}

function normalizeFunds(raw) {
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

/**
 * 更新盈亏提醒偏好 (合并写盘).
 * @param {object} patch  { enabled?, profitPct?, lossPct?, lastNotified? }
 */
function setAlertPrefs(patch, statePath) {
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

function isValidHolding(h) {
  return h && typeof h.id === "string" && /^\d{6}$/.test(String(h.code || ""));
}

function isValidDeleted(d) {
  return d && typeof d.id === "string" && typeof d.deletedAt === "number";
}

function validateAndFill(input) {
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
  // 内部字段: _amount = 买入金额 (只在 costNav=0 占位时存, 供 scheduler 反推成本)
  const amount = input._amount;
  const validAmount =
    amount != null && Number.isFinite(Number(amount)) && Number(amount) > 0
      ? Number(amount)
      : undefined;
  // _pendingNav: 标记待反推 (成本为 0 占位, 等净值拉取后用 _amount 折算)
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
  if (validAmount !== undefined) out._amount = validAmount;
  if (pendingNav) out._pendingNav = true;
  return out;
}

function validatePatch(prev, patch) {
  const next = Object.assign({}, prev, patch);
  return validateAndFill(next);
}

function genId() {
  // 12 位 base36, 跟前端 uuid 比起来短得多, 内部用足够
  return crypto.randomBytes(8).toString("hex");
}

class ValidationError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "ValidationError";
  }
}

/**
 * 用最新净值反填占位的 holding (costNav=0 + _pendingNav=true + _amount>0).
 *
 * @param {string} code              基金代码
 * @param {number} latestNav         拉到的最新净值 (估算或确认值, 都行)
 * @param {string} [statePath]
 * @returns {{ ok: true, holding: FundHolding, all: { holdings, deletedIds } } | { ok: false, reason: string }}
 *
 * 调用时机: scheduler 拉完一次净值, 遍历 navMap, 对每只基金调一次 backfillFromNav.
 *   - costNav > 0: 已填过成本, 跳过
 *   - _amount <= 0: 数据异常, 跳过
 *   - latestNav <= 0: 数据异常, 跳过
 *   - 反填: shares = _amount / latestNav, costNav = latestNav, _pendingNav = false
 */
function backfillFromNav(code, latestNav, statePath) {
  if (!/^\d{6}$/.test(String(code || "")))
    return { ok: false, reason: "invalid_code" };
  const nav = Number(latestNav);
  if (!Number.isFinite(nav) || nav <= 0)
    return { ok: false, reason: "invalid_nav" };

  const cur = loadAll(statePath);
  const idx = cur.holdings.findIndex((h) => h && h.code === code);
  if (idx === -1) return { ok: false, reason: "not_found" };

  const h = cur.holdings[idx];
  // 已填过成本 → skip (避免覆盖用户手动填的真实净值)
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
