import { describe, it, expect } from "vitest";
import { maSeries, emaSeries, macdSeries } from "../../../src/renderer/stocks/indicators";

describe("maSeries", () => {
  it("空数组 → 空", () => {
    expect(maSeries([], 5)).toEqual([]);
  });
  it("长度 < n → 全 null", () => {
    expect(maSeries([1, 2, 3], 5)).toEqual([null, null, null]);
  });
  it("前 n-1 位 null, 第 n 位起是窗口均值", () => {
    // 滑动: [1,2,3]→2, [2,3,4]→3, [3,4,5]→4
    expect(maSeries([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("标准 5 日 MA: [1..10]", () => {
    const r = maSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(r[0]).toBeNull();
    expect(r[3]).toBeNull();
    expect(r[4]).toBe(3);
    expect(r[9]).toBe(8);
  });
  it("含 NaN 不爆", () => {
    const r = maSeries([1, NaN, 3, 4, 5], 3);
    expect(r).toHaveLength(5);
    // NaN 透传 — 不做清洗, 渲染时跳过
    expect(Number.isNaN(r[2])).toBe(true);
  });
});

describe("emaSeries", () => {
  it("空数组 → 空", () => {
    expect(emaSeries([], 5)).toEqual([]);
  });
  it("长度 < n → 全 null", () => {
    const r = emaSeries([1, 2, 3], 5);
    expect(r).toHaveLength(3);
    expect(r.every((v) => v === null)).toBe(true);
  });
  it("前 n-1 位 null, 第 n 位起 EMA 平滑", () => {
    const r = emaSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(r.slice(0, 4)).toEqual([null, null, null, null]);
    expect(r[4]).toBe(3);                  // 初始 = SMA(1..5) = 3
    expect(r[5]).toBeCloseTo(4, 5);  // EMA = prev*(1-k) + new*k, k=2/6 → 3*(2/3) + 6*(1/3) = 4
  });
  it("输入含 0 不会爆", () => {
    const r = emaSeries([0, 0, 0, 0, 0, 5], 5);
    expect(r[5]).toBeGreaterThan(0);
  });
});

describe("macdSeries", () => {
  it("长度 < 26 → 全 null 三个数组", () => {
    const r = macdSeries([1, 2, 3, 4, 5]);
    expect(r.dif).toHaveLength(5);
    expect(r.dea).toHaveLength(5);
    expect(r.hist).toHaveLength(5);
    expect(r.dif.every((v) => v === null)).toBe(true);
  });
  it("正常 30 日 close → 三个数组长度 30, 后面非 null", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r = macdSeries(closes);
    expect(r.dif).toHaveLength(30);
    expect(r.dea).toHaveLength(30);
    expect(r.hist).toHaveLength(30);
    // 单调递增 → DIF > 0
    const lastDif = r.dif.filter((v) => v != null).pop();
    expect(lastDif).toBeGreaterThan(0);
  });
  it("EMA12/26 都没有的位 → DIF/DEA/HIST 全 null", () => {
    const r = macdSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);
    expect(r.dif[0]).toBeNull();
    expect(r.dif[25]).not.toBeNull();
    // DEA 需要 DIF 后 9 个点, 第 25 位 DIF 有效, 但 DEA 需要第 25 之后 9 个 → DEA[33] 才有效
    // 长度只有 27, DEA 全 null
    expect(r.dea.every((v) => v === null)).toBe(true);
  });
  it("价格不变 → DIF/DEA/HIST 接近 0", () => {
    const closes = new Array(30).fill(100);
    const r = macdSeries(closes);
    const lastDif = r.dif.filter((v) => v != null).pop();
    expect(Math.abs(lastDif)).toBeLessThan(0.01);
  });
});
