import { describe, it, expect } from "vitest";
import { describeArc, buildSegments, CATEGORY_ORDER } from "../../src/renderer/funds/FundAllocationDonut.jsx";

describe("buildSegments", () => {
  it("把市值映射成带角度的扇区, 总和360", () => {
    const seg = buildSegments({ stock: 6000, bond: 3000, money: 1000 }, 10000);
    expect(seg.length).toBe(3);
    const total = seg.reduce((s, x) => s + x.sweep, 0);
    expect(Math.round(total)).toBe(360);
  });
});
describe("describeArc", () => {
  it("生成合法 SVG path", () => {
    const d = describeArc(50, 50, 40, 0, 90);
    expect(d.startsWith("M")).toBe(true);
    expect(d.includes("A")).toBe(true);
  });
});
