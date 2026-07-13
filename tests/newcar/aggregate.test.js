/**
 * tests/newcar/aggregate.test.js
 *
 * 聚合纯函数验收: groupByMonth / groupByDate / computeKpis.
 * 无 Preact 依赖, node 环境即可运行.
 */

import { describe, it, expect } from "vitest";
import { groupByMonth, groupByDate, computeKpis } from "../../src/newcar/aggregate.js";

const mk = (id, date, brand = "比亚迪") => ({
  id,
  name: `${brand} ${id}`,
  brand,
  releaseDate: date,
  type: "轿车",
  energyType: "纯电",
  priceMin: 10,
  priceMax: 20,
  thumbnailUrl: null,
  sourceUrl: null,
  status: "上市",
});

describe("groupByMonth", () => {
  it("按 YYYY-MM 分组, 同月聚合到同一桶", () => {
    const list = [mk("a", "2026-07-10"), mk("b", "2026-07-16"), mk("c", "2026-03-01")];
    const m = groupByMonth(list);
    expect(m.size).toBe(2);
    expect(m.get("2026-07")).toHaveLength(2);
    expect(m.get("2026-03")).toHaveLength(1);
  });

  it("空 / undefined / null 输入返回空 Map", () => {
    expect(groupByMonth([]).size).toBe(0);
    expect(groupByMonth(undefined).size).toBe(0);
    expect(groupByMonth(null).size).toBe(0);
  });
});

describe("groupByDate", () => {
  it("按 YYYY-MM-DD 分组, 同日聚合", () => {
    const list = [mk("a", "2026-07-10"), mk("b", "2026-07-10"), mk("c", "2026-03-01")];
    const m = groupByDate(list);
    expect(m.get("2026-07-10")).toHaveLength(2);
    expect(m.get("2026-03-01")).toHaveLength(1);
  });

  it("空输入返回空 Map", () => {
    expect(groupByDate([]).size).toBe(0);
  });
});

describe("computeKpis", () => {
  // now = 2026-07-15 (周三). 用本地时区构造 Date, 与 releaseDate 解析同源, 避免时区漂移.
  const now = new Date(2026, 6, 15, 12, 0, 0);
  const list = [
    mk("a", "2026-07-10"), // 本月 / 上周 / 今年累计
    mk("b", "2026-07-16"), // 本月 / 本周 / 即将发布
    mk("c", "2026-03-01"), // 今年累计
    mk("d", "2025-12-01"), // 非今年
    mk("e", "2026-08-01"), // 即将发布
  ];

  it("本月 / 本周 / 今年累计 / 即将发布 计算正确", () => {
    const k = computeKpis(list, now);
    expect(k.thisMonth).toBe(2); // a, b
    expect(k.thisWeek).toBe(1); // b (07-16 落在周一 07-13 ~ 07-20)
    expect(k.ytd).toBe(2); // a, c (今年且 <= 今天)
    expect(k.upcoming).toBe(2); // b, e (严格晚于今天)
  });

  it("恰好今天发布: 计入今年累计, 不计入即将发布", () => {
    const today = mk("t", "2026-07-15");
    const k = computeKpis([today], now);
    expect(k.ytd).toBe(1);
    expect(k.upcoming).toBe(0);
  });

  it("空列表返回全 0", () => {
    const k = computeKpis([], now);
    expect(k).toEqual({ thisMonth: 0, thisWeek: 0, ytd: 0, upcoming: 0 });
  });
});
