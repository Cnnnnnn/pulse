/**
 * tests/newcar/dataset.test.js
 *
 * 数据层验收: loadBuiltinCalendar / normalize / filterReleases / fetchCarDetails(占位).
 */

import { describe, it, expect } from "vitest";
import {
  loadBuiltinCalendar,
  normalize,
  filterReleases,
  fetchCarDetails,
} from "../../src/newcar/dataset.js";

describe("loadBuiltinCalendar", () => {
  it("返回 { meta, releases } 且 releases 非空", () => {
    const ds = loadBuiltinCalendar();
    expect(ds).toHaveProperty("meta");
    expect(Array.isArray(ds.releases)).toBe(true);
    expect(ds.releases.length).toBeGreaterThan(0);
  });

  it("每条记录含唯一 id 与合法 releaseDate", () => {
    const ds = loadBuiltinCalendar();
    const ids = ds.releases.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // 无重复 id
    for (const r of ds.releases) {
      expect(typeof r.id).toBe("string");
      expect(r.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("normalize", () => {
  const ok = { id: "x1", releaseDate: "2026-01-01" };
  const noId = { releaseDate: "2026-01-01" };
  const badDate = { id: "x2", releaseDate: "2026/01/01" };
  const emptyId = { id: "", releaseDate: "2026-01-01" };

  it("保留合法记录", () => {
    expect(normalize([ok])).toHaveLength(1);
  });

  it("丢弃缺 id / id 为空 / 日期非法 的记录", () => {
    expect(normalize([noId, badDate, emptyId])).toHaveLength(0);
  });

  it("支持 { releases: [...] } 包裹形态", () => {
    expect(normalize({ releases: [ok] })).toHaveLength(1);
  });

  it("null / 空对象 / 非数组 → 空数组", () => {
    expect(normalize(null)).toEqual([]);
    expect(normalize({})).toEqual([]);
    expect(normalize(undefined)).toEqual([]);
  });

  it("内置数据集经 normalize 后数量不变 (全记录合法)", () => {
    const ds = loadBuiltinCalendar();
    expect(normalize(ds.releases).length).toBe(ds.releases.length);
  });
});

describe("filterReleases", () => {
  const list = [
    { id: "1", name: "A", brand: "比亚迪", releaseDate: "2026-03-12", type: "轿车", energyType: "纯电", priceMin: 18, priceMax: 26, status: "上市" },
    { id: "2", name: "B", brand: "特斯拉", releaseDate: "2026-04-01", type: "SUV", energyType: "纯电", priceMin: 25, priceMax: 35, status: "预售" },
    { id: "3", name: "C", brand: "比亚迪", releaseDate: "2026-05-01", type: "MPV", energyType: "混动", priceMin: null, priceMax: 30, status: "首发" },
    { id: "4", name: "D", brand: "理想", releaseDate: "2026-06-01", type: "SUV", energyType: "增程", priceMin: 10, priceMax: null, status: "改款" },
  ];

  it("空筛选 / 缺省返回全部", () => {
    expect(filterReleases(list, {})).toHaveLength(4);
    expect(filterReleases(list)).toHaveLength(4);
  });

  it("品牌白名单", () => {
    const r = filterReleases(list, { brands: ["比亚迪"] });
    expect(r.map((x) => x.id).sort()).toEqual(["1", "3"]);
  });

  it("能源筛选", () => {
    const r = filterReleases(list, { energyTypes: ["纯电"] });
    expect(r.map((x) => x.id).sort()).toEqual(["1", "2"]);
  });

  it("状态筛选", () => {
    const r = filterReleases(list, { status: ["预售"] });
    expect(r.map((x) => x.id)).toEqual(["2"]);
  });

  it("日期精确筛选", () => {
    const r = filterReleases(list, { date: "2026-03-12" });
    expect(r.map((x) => x.id)).toEqual(["1"]);
  });

  it("价格下限: 仅 priceMax >= priceMin 保留 (priceMax 为 null 排除)", () => {
    const r = filterReleases(list, { priceMin: 20 });
    // 1(26>=20) 2(35>=20) 3(30>=20) 保留; 4(priceMax=null) 排除
    expect(r.map((x) => x.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("价格上限: 仅 priceMin <= priceMax 保留 (priceMin 为 null 排除)", () => {
    const r = filterReleases(list, { priceMax: 26 });
    // 1(18<=26) 2(25<=26) 4(10<=26) 保留; 3(priceMin=null) 排除
    expect(r.map((x) => x.id).sort()).toEqual(["1", "2", "4"]);
  });

  it("组合筛选 (品牌 + 能源)", () => {
    const r = filterReleases(list, { brands: ["比亚迪"], energyTypes: ["纯电"] });
    expect(r.map((x) => x.id)).toEqual(["1"]);
  });
});

describe("fetchCarDetails (dataset 占位)", () => {
  it("MVP 直接返回 null, 不接真实 API", async () => {
    expect(await fetchCarDetails("any-id")).toBeNull();
  });
});
