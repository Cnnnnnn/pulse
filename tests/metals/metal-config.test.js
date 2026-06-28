import { describe, it, expect } from "vitest";
import { METALS, getMetalById } from "../../src/metals/metal-config.js";

describe("metal-config METALS history fields", () => {
  it("每个品种都有 historySecid / proxyLabel / unitDivisor 3 字段", () => {
    for (const m of METALS) {
      expect(typeof m.historySecid).toBe("string");
      expect(m.historySecid.length).toBeGreaterThan(0);
      expect(typeof m.unitDivisor).toBe("number");
      expect(m.unitDivisor === 1 || m.unitDivisor === 1000).toBe(true);
      // proxyLabel: 国内 null, 国际非空 string
      if (m.currency === "CNY") expect(m.proxyLabel).toBeNull();
      else expect(typeof m.proxyLabel).toBe("string");
    }
  });

  it("XAU → historySecid=113.AU2608, proxyLabel 含 '沪金2608'", () => {
    const m = getMetalById("XAU");
    expect(m.historySecid).toBe("113.AU2608");
    expect(m.proxyLabel).toMatch(/沪金/);
  });

  it("XAG → historySecid=113.AG2608, proxyLabel 含 '沪银2608'", () => {
    const m = getMetalById("XAG");
    expect(m.historySecid).toBe("113.AG2608");
    expect(m.proxyLabel).toMatch(/沪银/);
  });

  it("AU9999 → unitDivisor=1 (元/克)", () => {
    expect(getMetalById("AU9999").unitDivisor).toBe(1);
  });

  it("AG9999 → unitDivisor=1000 (元/千克 → 折算元/克)", () => {
    expect(getMetalById("AG9999").unitDivisor).toBe(1000);
  });
});
