import { describe, it, expect } from "vitest";
import { isTradingHours } from "../../src/main/stocks-scheduler";

describe("isTradingHours", () => {
  // 2026-06-24 是周三
  it("true on weekday during trading hours", () => {
    expect(isTradingHours(new Date(2026, 5, 24, 10, 30))).toBe(true);
  });
  it("true at exactly 9:30", () => {
    expect(isTradingHours(new Date(2026, 5, 24, 9, 30))).toBe(true);
  });
  it("true at exactly 15:00", () => {
    expect(isTradingHours(new Date(2026, 5, 24, 15, 0))).toBe(true);
  });
  it("false on Saturday", () => {
    expect(isTradingHours(new Date(2026, 5, 27, 10, 30))).toBe(false); // 2026-06-27 周六
  });
  it("false on Sunday", () => {
    expect(isTradingHours(new Date(2026, 5, 28, 10, 30))).toBe(false); // 2026-06-28 周日
  });
  it("false before 9:30", () => {
    expect(isTradingHours(new Date(2026, 5, 24, 9, 0))).toBe(false);
  });
  it("false after 15:00", () => {
    expect(isTradingHours(new Date(2026, 5, 24, 16, 0))).toBe(false);
  });
});
