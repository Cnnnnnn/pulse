/**
 * tests/renderer/worldcup-timeUtils.test.js
 */

import { describe, it, expect } from "vitest";
import {
  parseUtcOffset,
  toBeijingTime,
} from "../../src/renderer/worldcup/timeUtils.js";

describe("parseUtcOffset", () => {
  it("UTC-6 → +6 (当地加 6 小时得 UTC)", () => {
    expect(parseUtcOffset("UTC-6")).toBe(6);
  });

  it("UTC+5 → -5", () => {
    expect(parseUtcOffset("UTC+5")).toBe(-5);
  });

  it("空 / 非法 → 0", () => {
    expect(parseUtcOffset("")).toBe(0);
    expect(parseUtcOffset("PST")).toBe(0);
  });
});

describe("toBeijingTime", () => {
  it("加拿大 13:00 UTC-6 → 次日 03:00 北京", () => {
    const r = toBeijingTime("13:00", "UTC-6", "2026-06-12");
    expect(r.time).toBe("03:00");
    expect(r.date).toBe("2026-06-13");
    expect(r.originalTime).toBe("13:00 UTC-6");
  });

  it("墨西哥开幕 13:00 UTC-6 → 次日 03:00 北京", () => {
    const r = toBeijingTime("13:00", "UTC-6", "2026-06-11");
    expect(r.time).toBe("03:00");
    expect(r.date).toBe("2026-06-12");
  });

  it("20:00 UTC-6 → 当日 10:00 北京 (跨 UTC 日但北京同日)", () => {
    const r = toBeijingTime("20:00", "UTC-6", "2026-06-11");
    expect(r.time).toBe("10:00");
    expect(r.date).toBe("2026-06-12");
  });

  it("决赛 15:00 UTC-4 → 次日 03:00 北京", () => {
    const r = toBeijingTime("15:00", "UTC-4", "2026-07-19");
    expect(r.time).toBe("03:00");
    expect(r.date).toBe("2026-07-20");
  });

  it("无时区时按 UTC 处理", () => {
    const r = toBeijingTime("12:00", "", "2026-06-11");
    expect(r.time).toBe("20:00");
    expect(r.date).toBe("2026-06-11");
  });
});
