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

describe("metal-config METALS compare mapping (2026-07-13 投资 nav 合并)", () => {
  it("每个品种都有 compareCode 或显式 noCompare", () => {
    for (const m of METALS) {
      const has = typeof m.compareCode === "string" && m.compareCode.length > 0;
      expect(has || m.noCompare === true).toBe(true);
    }
  });

  it("compareName 与 compareCode 同时存在 (非 noCompare)", () => {
    for (const m of METALS) {
      if (m.noCompare === true) continue;
      expect(typeof m.compareCode).toBe("string");
      expect(m.compareCode.length).toBe(6);
      expect(typeof m.compareName).toBe("string");
      expect(m.compareName.length).toBeGreaterThan(0);
    }
  });

  it("XAU/AU9999 共用 518880 (华安黄金ETF, 同标的), XAG/AG9999 共用 161226 (国投白银LOF)", () => {
    // ponytail: 这是有意为之 —— 现货黄金/国内黄金本是同一标的的不同报价口径,
    //   映射到同一只 ETF 后, 加入对比池会互相 toggle (comparePool 以 code 为唯一键).
    const byCode = {};
    for (const m of METALS) {
      if (!m.compareCode) continue;
      (byCode[m.compareCode] ||= []).push(m.id);
    }
    expect(byCode["518880"].sort()).toEqual(["AU9999", "XAU"]);
    expect(byCode["161226"].sort()).toEqual(["AG9999", "XAG"]);
  });
});
