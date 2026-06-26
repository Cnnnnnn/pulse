/**
 * src/main/stock-store.js
 *
 * 股票筛选器持久化 — state.json.stockWatchlist + state.json.stockScreener.
 * 对照 fund-store.js: 复用 stateStore.patchState, 自动 preserve 其它字段.
 *
 * Schema:
 *   stockWatchlist: [{ code, name, industry, addedAt }]
 *     - code 6 位 A 股代码 (exact match 去重)
 *     - 不存行情/估值快照 (每次刷新现拉, 避免脏数据)
 *   stockScreener:  { lastCriteria, activeStrategy, lastSort }
 */
const stateStore = require("./state-store");

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const code = String(raw.code || "").trim();
  if (!/^\d{6}$/.test(code)) return null;
  return {
    code,
    name: typeof raw.name === "string" && raw.name ? raw.name : null,
    industry:
      typeof raw.industry === "string" && raw.industry ? raw.industry : null,
    addedAt: typeof raw.addedAt === "number" ? raw.addedAt : Date.now(),
  };
}

/**
 * 读自选股. 无字段 / 损坏 → [].
 * @param {string} [statePath]
 * @returns {Array<{code,name,industry,addedAt}>}
 */
function loadStockWatchlist(statePath) {
  const s = stateStore.load(statePath);
  if (!s || !Array.isArray(s.stockWatchlist)) return [];
  return s.stockWatchlist.map(normalizeItem).filter(Boolean);
}

function saveStockWatchlist(list, statePath) {
  const safe = (Array.isArray(list) ? list : [])
    .map(normalizeItem)
    .filter(Boolean);
  stateStore.patchState((next) => {
    next.stockWatchlist = safe;
  }, statePath);
  return safe;
}

class ValidationError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "ValidationError";
  }
}

/**
 * 加自选 (dedupe by code). 校验 code 为 6 位数字.
 * @param {{code:string, name?:string, industry?:string, addedAt?:number}} input
 * @param {string} [statePath]
 * @returns {Array} 新列表
 * @throws {ValidationError} code 非法
 */
function addStock(input, statePath) {
  if (!input || typeof input !== "object") {
    throw new ValidationError("stock input must be object");
  }
  const item = normalizeItem(input);
  if (!item) throw new ValidationError(`invalid stock code: ${input.code}`);
  const cur = loadStockWatchlist(statePath);
  if (cur.some((x) => x.code === item.code)) return cur; // dedupe
  const next = [...cur, item];
  return saveStockWatchlist(next, statePath);
}

/**
 * 删自选 (by code, 幂等).
 * @param {string} code
 * @param {string} [statePath]
 * @returns {Array} 新列表
 */
function removeStock(code, statePath) {
  const c = String(code || "").trim();
  const cur = loadStockWatchlist(statePath);
  const next = cur.filter((x) => x.code !== c);
  if (next.length === cur.length) return cur; // 不存在, 幂等
  return saveStockWatchlist(next, statePath);
}

// ── screener prefs (上次条件 + 策略 + 排序) ──

const DEFAULT_SCREENER = {
  lastCriteria: null,
  activeStrategy: "value_roe",
  lastSort: { key: "roe", dir: "desc" },
};

function loadStockScreener(statePath) {
  const s = stateStore.load(statePath);
  if (!s || !s.stockScreener || typeof s.stockScreener !== "object") {
    return { ...DEFAULT_SCREENER };
  }
  const c = s.stockScreener;
  return {
    lastCriteria: c.lastCriteria || null,
    activeStrategy:
      typeof c.activeStrategy === "string"
        ? c.activeStrategy
        : DEFAULT_SCREENER.activeStrategy,
    lastSort:
      c.lastSort && c.lastSort.key
        ? c.lastSort
        : DEFAULT_SCREENER.lastSort,
  };
}

/**
 * 合并写 screener prefs (patch 覆盖到 cur).
 * @param {object} patch  { lastCriteria?, activeStrategy?, lastSort? }
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 prefs
 */
function saveStockScreener(patch, statePath) {
  const cur = loadStockScreener(statePath);
  const next = { ...cur, ...(patch || {}) };
  stateStore.patchState((st) => {
    st.stockScreener = next;
  }, statePath);
  return next;
}

// ponytail: 阶段二 — AI 推荐策略缓存. advisor.js 直接走 state-store.patchState,
// 这里只提供 load + 一个 prune-old-entries helper (IPC handler 调用前清理过期).
function loadAiStockAdviseCache(statePath) {
  const s = stateStore.load(statePath);
  const cache = s && s.aiStockAdviseCache;
  if (!cache || typeof cache !== "object") return {};
  return cache;
}

function pruneAiStockAdviseCache(ttlMs, statePath) {
  // ponytail: 清理 24h+ 过期条目, 防 state.json 无限增长. 调用方传 ttlMs (advisor CACHE_TTL_MS).
  const cache = loadAiStockAdviseCache(statePath);
  const now = Date.now();
  let changed = false;
  const next = {};
  for (const [k, v] of Object.entries(cache)) {
    if (v && typeof v.fetchedAt === "number" && now - v.fetchedAt < ttlMs) {
      next[k] = v;
    } else {
      changed = true;
    }
  }
  if (changed) {
    stateStore.patchState((st) => {
      st.aiStockAdviseCache = next;
    }, statePath);
  }
  return next;
}

module.exports = {
  loadStockWatchlist,
  saveStockWatchlist,
  addStock,
  removeStock,
  loadStockScreener,
  saveStockScreener,
  loadAiStockAdviseCache,
  pruneAiStockAdviseCache,
  normalizeItem,
  ValidationError,
  DEFAULT_SCREENER,
};
