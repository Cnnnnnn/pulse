/**
 * src/funds/fund-history.ts
 *
 * 基金每日盈亏快照 — 纯函数 (主进程 + renderer 共用).
 */

const MAX_SNAPSHOT_DAYS = 400;

export function ymdShanghai(d: any) {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ymShanghai(d: any) {
  return ymdShanghai(d).slice(0, 7);
}

export function isValidSnapshot(s: any) {
  return (
    s &&
    typeof s.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    Number.isFinite(Number(s.todayProfit)) &&
    Number.isFinite(Number(s.recordedAt))
  );
}

function round2(n: any) {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

function round4(n: any) {
  const r = Math.round(n * 10000) / 10000;
  return r === 0 ? 0 : r;
}

export function buildSnapshotFromMetrics(date: any, metrics: any, recordedAt?: any) {
  return {
    date,
    todayProfit: round2(metrics.todayProfit),
    totalMarketValue: round2(metrics.totalMarketValue),
    totalCost: round2(metrics.totalCost),
    totalProfit: round2(metrics.totalProfit),
    recordedAt: recordedAt || Date.now(),
  };
}

export function upsertDailySnapshot(snapshots: any, entry: any) {
  if (!entry || !entry.date) return snapshots || [];
  const list = (snapshots || []).filter((s: any) => s && s.date !== entry.date);
  list.push(entry);
  list.sort((a: any, b: any) => b.date.localeCompare(a.date));
  return list;
}

export function pruneSnapshots(snapshots: any, maxDays = MAX_SNAPSHOT_DAYS) {
  const sorted = [...(snapshots || [])].sort((a: any, b: any) =>
    b.date.localeCompare(a.date),
  );
  return sorted.slice(0, maxDays);
}

export function shiftMonth(ym: any, delta: any) {
  const parts = String(ym || "").split("-");
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ymShanghai(new Date());
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(ym: any) {
  const parts = String(ym || "").split("-");
  if (parts.length < 2) return ym;
  return `${parts[0]}年${parseInt(parts[1], 10)}月`;
}

export function monthProfit(snapshots: any, ym: any) {
  if (!ym) return 0;
  return round2(
    (snapshots || [])
      .filter((s: any) => s && s.date && s.date.startsWith(ym))
      .reduce((acc: any, s: any) => acc + Number(s.todayProfit || 0), 0),
  );
}

export function computeMonthlyRollups(snapshots: any, now = new Date()) {
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

export function listDaysForMonth(snapshots: any, ym: any) {
  return (snapshots || [])
    .filter((s: any) => s && s.date && s.date.startsWith(ym))
    .sort((a: any, b: any) => b.date.localeCompare(a.date))
    .map((s: any) => ({
      ...s,
      dayReturnPct:
        Number(s.totalMarketValue) > 0
          ? round4((Number(s.todayProfit) / Number(s.totalMarketValue)) * 100)
          : 0,
    }));
}


