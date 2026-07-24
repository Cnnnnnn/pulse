/**
 * tests/ai-usage/anomaly-detect.test.js
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { detectUsageAnomaly } = require("../../src/ai-usage/anomaly-detect");
const { todayKey, addDays } = require("../../src/ai-usage/history-series");

describe("detectUsageAnomaly", () => {
  it("数据不足 → 无异常", () => {
    const today = todayKey();
    const r = detectUsageAnomaly([
      { date: today, percent: 90 },
      { date: addDays(today, -1), percent: 20 },
    ]);
    expect(r.anomaly).toBe(false);
  });

  it("今日尖峰 → 异常", () => {
    const today = todayKey();
    const days = [];
    for (let i = 6; i >= 1; i--) {
      days.push({ date: addDays(today, -i), percent: 20 });
    }
    days.push({ date: today, percent: 80 });
    const r = detectUsageAnomaly(days);
    expect(r.anomaly).toBe(true);
    expect(r.todayPercent).toBe(80);
  });

  it("去重: 同日已通知且未再涨 5pp → 不异常", () => {
    const today = todayKey();
    const days = [];
    for (let i = 6; i >= 1; i--) {
      days.push({ date: addDays(today, -i), percent: 20 });
    }
    days.push({ date: today, percent: 80 });
    const r = detectUsageAnomaly(days, { lastNotifiedPercent: 78 });
    expect(r.anomaly).toBe(false);
    expect(r.reason).toBe("deduped");
  });
});
