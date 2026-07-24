/**
 * tests/main/fund-history.test.js
 */

import { describe, it, expect } from "vitest";
const {
  upsertDailySnapshot,
  pruneSnapshots,
  computeMonthlyRollups,
  monthProfit,
  listDaysForMonth,
  shiftMonth,
} = require("../../src/funds/fund-history.js");

const snap = (date, todayProfit, mv = 10000) => ({
  date,
  todayProfit,
  totalMarketValue: mv,
  totalCost: 9000,
  totalProfit: mv - 9000,
  recordedAt: Date.now(),
});

describe("upsertDailySnapshot", () => {
  it("同日覆盖更新", () => {
    const a = upsertDailySnapshot([], snap("2026-06-12", 100));
    const b = upsertDailySnapshot(a, snap("2026-06-12", 200));
    expect(b).toHaveLength(1);
    expect(b[0].todayProfit).toBe(200);
  });

  it("多日按日期倒序", () => {
    const out = upsertDailySnapshot(
      [snap("2026-06-10", 10)],
      snap("2026-06-12", 20),
    );
    expect(out.map((x) => x.date)).toEqual(["2026-06-12", "2026-06-10"]);
  });
});

describe("monthProfit", () => {
  it("按月汇总 todayProfit", () => {
    const list = [
      snap("2026-06-10", 100),
      snap("2026-06-11", 50),
      snap("2026-05-30", 999),
    ];
    expect(monthProfit(list, "2026-06")).toBe(150);
  });
});

describe("computeMonthlyRollups", () => {
  it("返回本月/上月盈亏", () => {
    const now = new Date("2026-06-15T10:00:00+08:00");
    const list = [snap("2026-06-10", 100), snap("2026-05-20", 80)];
    const r = computeMonthlyRollups(list, now);
    expect(r.currentMonth.profit).toBe(100);
    expect(r.previousMonth.profit).toBe(80);
  });
});

describe("pruneSnapshots", () => {
  it("保留最近 N 天", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      snap(`2026-01-0${i + 1}`, i),
    );
    const out = pruneSnapshots(list, 3);
    expect(out).toHaveLength(3);
  });
});

describe("shiftMonth", () => {
  it("跨月", () => {
    expect(shiftMonth("2026-06", -1)).toBe("2026-05");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("listDaysForMonth", () => {
  it("只返回指定月份", () => {
    const list = [snap("2026-06-01", 1), snap("2026-05-31", 9)];
    const days = listDaysForMonth(list, "2026-06");
    expect(days).toHaveLength(1);
    expect(days[0].dayReturnPct).toBeCloseTo(0.01, 2);
  });
});
