/**
 * src/main/fund-history-store.js
 *
 * 基金每日盈亏快照持久化 (state.json.funds.dailySnapshots).
 */

const stateStore = require("./state-store");
const fundStore = require("./fund-store");
const {
  ymdShanghai,
  isValidSnapshot,
  buildSnapshotFromMetrics,
  upsertDailySnapshot,
  pruneSnapshots,
} = require("../funds/fund-history");
const {
  calcPortfolioTotal,
  zipHoldingsWithNav,
  rowWithMetrics,
} = require("../funds/fundCalc");
const { resolveNavSnapshot } = require("../funds/fund-nav-merge");

function loadSnapshots(statePath) {
  const s = stateStore.load(statePath);
  const raw = s && s.funds && s.funds.dailySnapshots;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidSnapshot);
}

function saveSnapshots(snapshots, statePath) {
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
 * @param {Record<string, object>} navMap
 * @param {Date} [now]
 */
function recordFromNavMap(navMap, now = new Date(), statePath) {
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

  const rows = zipHoldingsWithNav(holdings, navMap).map((row) => {
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

function loadNavHistory(code, statePath) {
  const s = stateStore.load(statePath);
  const map = s && s.funds && s.funds.navHistory;
  return map && Array.isArray(map[code]) ? map[code] : [];
}

function saveNavHistory(code, series, statePath) {
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

module.exports = {
  loadSnapshots,
  saveSnapshots,
  recordFromNavMap,
  loadNavHistory,
  saveNavHistory,
};
