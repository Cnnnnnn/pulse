import { describe, it, expect } from "vitest";
import { ANGLE_DEFS, getAngle } from "../../src/stocks/stock-detail-angles";

describe("stock-detail-angles", () => {
  it("ANGLE_DEFS has exactly 7 angles", () => {
    expect(ANGLE_DEFS).toHaveLength(7);
  });

  it("each angle has required fields", () => {
    for (const a of ANGLE_DEFS) {
      expect(a.key).toMatch(/^[a-z_]+$/);
      expect(a.label).toBeTruthy();
      expect(a.group).toBeTruthy();
      expect(a.promptHint).toBeTruthy();
      expect(a.dataShape).toBeTruthy();
      expect(typeof a.fetcher).toBe("function");
    }
  });

  it("keys are unique", () => {
    const keys = ANGLE_DEFS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("groups cover 行情/财务/资金/技术/舆情", () => {
    const groups = new Set(ANGLE_DEFS.map((a) => a.group));
    expect(groups.has("行情")).toBe(true);
    expect(groups.has("财务")).toBe(true);
    expect(groups.has("资金")).toBe(true);
    expect(groups.has("技术")).toBe(true);
    expect(groups.has("舆情")).toBe(true);
  });

  it("getAngle returns matching entry", () => {
    const a = getAngle("price_trend");
    expect(a).not.toBeNull();
    expect(a.key).toBe("price_trend");
  });

  it("getAngle returns null for unknown key", () => {
    expect(getAngle("not_a_key")).toBeNull();
  });
});