/**
 * tests/main/token-budget.test.js
 *
 * P71 Task 1: token-budget 纯函数 (当日累计 / 预算检查 / 30d LRU).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  todayKey,
  addSpend,
  isOverBudget,
  pruneDays,
} = require("../../src/main/token-budget");

describe("token-budget", () => {
  describe("todayKey", () => {
    it("返回 YYYY-MM-DD", () => {
      const k = todayKey(new Date("2026-06-25T10:00:00"));
      expect(k).toBe("2026-06-25");
    });
    it("传入时间戳也行", () => {
      expect(todayKey(new Date("2026-01-05T00:00:00").getTime())).toBe("2026-01-05");
    });
  });

  describe("addSpend", () => {
    it("当日累计", () => {
      const out = addSpend({}, "2026-06-25", 100);
      expect(out["2026-06-25"]).toBe(100);
      const out2 = addSpend(out, "2026-06-25", 50);
      expect(out2["2026-06-25"]).toBe(150);
    });
    it("不同日分开", () => {
      const out = addSpend(addSpend({}, "2026-06-25", 100), "2026-06-24", 30);
      expect(out["2026-06-25"]).toBe(100);
      expect(out["2026-06-24"]).toBe(30);
    });
    it("token 非数字忽略 (返回原 map)", () => {
      const base = { "2026-06-25": 10 };
      expect(addSpend(base, "2026-06-25", "abc")).toBe(base);
      expect(addSpend(base, "2026-06-25", NaN)).toBe(base);
      expect(addSpend(base, "2026-06-25", -5)).toBe(base);
    });
  });

  describe("isOverBudget", () => {
    it("未超返 false", () => {
      expect(isOverBudget({ "2026-06-25": 100 }, "2026-06-25", 500)).toBe(false);
    });
    it("超限 (>=) 返 true", () => {
      expect(isOverBudget({ "2026-06-25": 500 }, "2026-06-25", 500)).toBe(true);
      expect(isOverBudget({ "2026-06-25": 600 }, "2026-06-25", 500)).toBe(true);
    });
    it("limit=0 视为未设预算(不拦截)", () => {
      expect(isOverBudget({ "2026-06-25": 999999 }, "2026-06-25", 0)).toBe(false);
    });
    it("无当日记录视为 0", () => {
      expect(isOverBudget({}, "2026-06-25", 500)).toBe(false);
    });
  });

  describe("pruneDays", () => {
    it("保留最近 N 天 (按日期字典序 = 时间序)", () => {
      // 造 35 个真实日期: 2025-01-01 起, 逐日递增 (跨月)
      const big = {};
      const base = new Date("2025-01-01T00:00:00");
      for (let i = 0; i < 35; i++) {
        const d = new Date(base.getTime() + i * 86400000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        big[`${y}-${m}-${day}`] = i + 1;
      }
      const out = pruneDays(big, 30);
      expect(Object.keys(out).length).toBe(30);
      // 保留最新 30 天: i=5..34 (即值 6..35), 最老 i=5 = 2025-01-06, 最新 i=34 = 2025-02-04
      expect(out["2025-01-06"]).toBe(6);
      expect(out["2025-02-04"]).toBe(35);
      expect(out["2025-01-05"]).toBeUndefined();
    });
    it("未超不截 (同引用)", () => {
      const big = { "2026-06-25": 1, "2026-06-24": 2 };
      expect(pruneDays(big, 30)).toBe(big);
    });
  });
});
