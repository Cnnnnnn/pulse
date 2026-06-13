/**
 * tests/main/ithome-date-bounds.test.js
 */

import { describe, it, expect } from "vitest";
const {
  isFetchableDate,
  assertFetchableDate,
  todayShanghaiDateKey,
} = require("../../src/main/ithome/date-bounds.js");

describe("ithome date-bounds", () => {
  const now = new Date("2026-06-12T12:00:00+08:00");

  it("allows dates in current month up to today", () => {
    expect(isFetchableDate("2026-06-01", now)).toBe(true);
    expect(isFetchableDate("2026-06-12", now)).toBe(true);
  });

  it("rejects last month and future", () => {
    expect(isFetchableDate("2026-05-31", now)).toBe(false);
    expect(isFetchableDate("2026-06-13", now)).toBe(false);
  });

  it("assertFetchableDate throws not_current_month", () => {
    expect(() => assertFetchableDate("2026-05-01", now)).toThrow(
      /not_current_month/,
    );
  });

  it("todayShanghaiDateKey", () => {
    expect(todayShanghaiDateKey(now)).toBe("2026-06-12");
  });
});
