import { describe, it, expect } from "vitest";
import { STRATEGIES, getStrategy, buildCriteria } from "../../src/stocks/strategies";

describe("strategies", () => {
  it("has 4 strategies with id+label", () => {
    expect(STRATEGIES).toHaveLength(4);
    expect(STRATEGIES.map((s) => s.id)).toEqual([
      "value_roe", "blue_chip", "high_div", "momentum",
    ]);
    for (const s of STRATEGIES) {
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("value_roe builds PE 0-20, ROE>=15, large", () => {
    const c = buildCriteria("value_roe");
    expect(c.peMin).toBe(0);
    expect(c.peMax).toBe(20);
    expect(c.roeMin).toBe(15);
    expect(c.marketCapTier).toBe("large");
  });

  it("blue_chip builds large, ROE>=15, PE 0-30", () => {
    const c = buildCriteria("blue_chip");
    expect(c.marketCapTier).toBe("large");
    expect(c.roeMin).toBe(15);
    expect(c.peMax).toBe(30);
  });

  it("high_div builds dividendYieldMin>=4, large", () => {
    const c = buildCriteria("high_div");
    expect(c.dividendYieldMin).toBe(4);
    expect(c.marketCapTier).toBe("large");
  });

  it("momentum builds change5dMin>=3, ROE>=10", () => {
    const c = buildCriteria("momentum");
    expect(c.change5dMin).toBe(3);
    expect(c.roeMin).toBe(10);
  });

  it("buildCriteria unknown id returns null", () => {
    expect(buildCriteria("nope")).toBe(null);
  });

  it("getStrategy returns the strategy object", () => {
    expect(getStrategy("value_roe").id).toBe("value_roe");
    expect(getStrategy("missing")).toBe(null);
  });
});
