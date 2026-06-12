/**
 * src/funds/fund-history.js
 *
 * 基金每日盈亏快照 — 纯函数 (主进程 + renderer 共用).
 */

const MAX_SNAPSHOT_DAYS = 400;

function ymdShanghai(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function ymShanghai(d) {
  return ymdShanghai(d).slice(0, 7);
}

function isValidSnapshot(s) {
  return (
    s &&
    typeof s.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    Number.isFinite(Number(s.todayProfit)) &&
    Number.isFinite(Number(s.recordedAt))
  );
}

function round2(n) {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function round4(n) {
  const r = Math.round(n * 10000) / 10000;
  return r === 0 ? 0 : r;
}

function buildSnapshotFromMetrics(date, metrics, recordedAt) {
  return {
    date,
    todayProfit: round2(metrics.todayProfit),
    totalMarketValue: round2(metrics.totalMarketValue),
    totalCost: round2(metrics.totalCost),
    totalProfit: round2(metrics.totalProfit),
    recordedAt: recordedAt || Date.now(),
  };
}

function upsertDailySnapshot(snapshots, entry) {
  if (!entry || !entry.date) return snapshots || [];
  const list = (snapshots || []).filter((s) => s && s.date !== entry.date);
  list.push(entry);
  list.sort((a, b) => b.date.localeCompare(a.date));
  return list;
}

function pruneSnapshots(snapshots, maxDays = MAX_SNAPSHOT_DAYS) {
  const sorted = [...(snapshots || [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  return sorted.slice(0, maxDays);
}

function shiftMonth(ym, delta) {
  const parts = String(ym || "").split("-");
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ymShanghai(new Date());
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(ym) {
  const parts = String(ym || "").split("-");
  if (parts.length < 2) return ym;
  return `${parts[0]}年${parseInt(parts[1], 10)}月`;
}

function monthProfit(snapshots, ym) {
  if (!ym) return 0;
  return round2(
    (snapshots || [])
      .filter((s) => s && s.date && s.date.startsWith(ym))
      .reduce((acc, s) => acc + Number(s.todayProfit || 0), 0),
  );
}

function computeMonthlyRollups(snapshots, now = new Date()) {
  const currentYm = ymShanghai(now);
  const previousYm = shiftMonth(currentYm, -1);
  return {
    currentMonth: {
      ym: currentYm,
      profit: monthProfit(snapshots, currentYm),
      label: formatMonthLabel(currentYm),
    },
    previousMonth: {
      ym: previousYm,
      profit: monthProfit(snapshots, previousYm),
      label: formatMonthLabel(previousYm),
    },
  };
}

function listDaysForMonth(snapshots, ym) {
  return (snapshots || [])
    .filter((s) => s && s.date && s.date.startsWith(ym))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => ({
      ...s,
      dayReturnPct:
        Number(s.totalMarketValue) > 0
          ? round4((Number(s.todayProfit) / Number(s.totalMarketValue)) * 100)
          : 0,
    }));
}

function recentDailyList(snapshots, days = 30) {
  const ym = ymShanghai(new Date());
  const inMonth = listDaysForMonth(snapshots, ym);
  return inMonth.slice(0, days);
}

function yesterdayProfit(snapshots, now = new Date()) {
  const today = ymdShanghai(now);
  const yesterday = ymdShanghai(new Date(now.getTime() - 86400000));
  const snap = (snapshots || []).find((s) => s && s.date === yesterday);
  if (snap) return round2(Number(snap.todayProfit));
  const sorted = [...(snapshots || [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const past = sorted.find((s) => s.date < today);
  return past ? round2(Number(past.todayProfit)) : null;
}

module.exports = {
  MAX_SNAPSHOT_DAYS,
  ymdShanghai,
  ymShanghai,
  isValidSnapshot,
  buildSnapshotFromMetrics,
  upsertDailySnapshot,
  pruneSnapshots,
  shiftMonth,
  formatMonthLabel,
  monthProfit,
  computeMonthlyRollups,
  listDaysForMonth,
  recentDailyList,
  yesterdayProfit,
};
