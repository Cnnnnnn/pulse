import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dealsCacheKey,
  dealsCacheGet,
  dealsCacheSet,
  resetDealsCache,
  DEALS_CACHE_TTL_MS,
  ALLOWED_MODES,
  applySortAndFilter,
} = require("../../../src/main/ipc/register-games.js");

beforeEach(() => resetDealsCache());

describe("dealsCacheKey", () => {
  it("不同 (platform, mode) 生成不同 key", () => {
    const k1 = dealsCacheKey({ platform: "steam", mode: "deals" });
    const k2 = dealsCacheKey({ platform: "steam", mode: "free" });
    const k3 = dealsCacheKey({ platform: "epic", mode: "deals" });
    expect(new Set([k1, k2, k3]).size).toBe(3);
  });

  it("sort / minSavings 不进 key（本地应用，避免改下拉框触发重拉）", () => {
    const base = dealsCacheKey({ platform: "steam", mode: "deals" });
    expect(dealsCacheKey({ platform: "steam", mode: "deals", sort: "price" })).toBe(base);
    expect(dealsCacheKey({ platform: "steam", mode: "deals", minSavings: 50 })).toBe(base);
    expect(
      dealsCacheKey({ platform: "steam", mode: "deals", sort: "rating", minSavings: 30 }),
    ).toBe(base);
  });

  it("相同参数生成相同 key", () => {
    const k1 = dealsCacheKey({ platform: "all", mode: "free" });
    const k2 = dealsCacheKey({ platform: "all", mode: "free" });
    expect(k1).toBe(k2);
  });
});

describe("dealsCache TTL", () => {
  it("TTL 内命中缓存", () => {
    const key = dealsCacheKey({ platform: "steam", mode: "deals" });
    const result = { ok: true, items: [{ id: "x" }], count: 1 };
    dealsCacheSet(key, result);
    expect(dealsCacheGet(key)).toBe(result);
  });

  it("过期后返回 null", () => {
    const key = dealsCacheKey({ platform: "steam", mode: "deals" });
    dealsCacheSet(key, { ok: true, items: [] });

    vi.useFakeTimers();
    vi.advanceTimersByTime(DEALS_CACHE_TTL_MS + 1);
    expect(dealsCacheGet(key)).toBeNull();
    vi.useRealTimers();
  });

  it("未设置的 key 返回 null", () => {
    const key = dealsCacheKey({ platform: "epic", mode: "free" });
    expect(dealsCacheGet(key)).toBeNull();
  });
});

describe("dealsCacheGet/Set 往返", () => {
  it("存入对象后取回同一引用", () => {
    const key = "test-key";
    const result = { ok: true, items: [{ id: "a" }, { id: "b" }], count: 2 };
    dealsCacheSet(key, result);
    expect(dealsCacheGet(key)).toBe(result);
  });
});

describe("ALLOWED_MODES 白名单（Task 2 清理验证）", () => {
  it("含 deals、free、compare，不含 top", () => {
    expect(ALLOWED_MODES).toEqual(["deals", "free", "compare"]);
    expect(ALLOWED_MODES).not.toContain("top");
  });
});

const { extractLowestFromCheapshark } = require("../../../src/main/ipc/register-games.js");

describe("extractLowestFromCheapshark", () => {
  it("取多个商店报价的最小值", () => {
    expect(extractLowestFromCheapshark([
      { cheapest: "4.99" }, { cheapest: "3.49" },
    ])).toBe(3.49);
  });
  it("单个商店", () => {
    expect(extractLowestFromCheapshark([{ cheapest: "9.99" }])).toBe(9.99);
  });
  it("空数组或非数组返回 null", () => {
    expect(extractLowestFromCheapshark([])).toBeNull();
    expect(extractLowestFromCheapshark(null)).toBeNull();
  });
  it("无效 cheapest 被忽略", () => {
    expect(extractLowestFromCheapshark([
      { cheapest: "abc" }, { cheapest: "5.00" },
    ])).toBe(5.0);
  });
});

describe("applySortAndFilter", () => {
  const baseItems = [
    { id: "a", salePrice: 30, savings: 20, rating: 80 },
    { id: "b", salePrice: 10, savings: 60, rating: 95 },
    { id: "c", salePrice: 20, savings: 40, rating: 70 },
  ];
  const okResult = { ok: true, items: baseItems, count: 3, sources: {} };

  it("sort=savings 按折扣力度降序", () => {
    const out = applySortAndFilter(okResult, { mode: "deals", sort: "savings", minSavings: 0 });
    expect(out.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sort=price 按售价升序", () => {
    const out = applySortAndFilter(okResult, { mode: "deals", sort: "price", minSavings: 0 });
    expect(out.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("sort=rating 按评分降序", () => {
    const out = applySortAndFilter(okResult, { mode: "deals", sort: "rating", minSavings: 0 });
    expect(out.items.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("minSavings 过滤低于门槛的条目", () => {
    const out = applySortAndFilter(okResult, { mode: "deals", sort: "savings", minSavings: 40 });
    expect(out.items.map((i) => i.id)).toEqual(["b", "c"]);
    expect(out.count).toBe(2);
  });

  it("minSavings + sort 组合", () => {
    const out = applySortAndFilter(okResult, { mode: "deals", sort: "price", minSavings: 40 });
    // 过滤后只剩 b(60%,10) + c(40%,20)，按 price 升序 → b, c
    expect(out.items.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("非 deals 模式原样返回（free/compare 已在 aggregator 内排序）", () => {
    const out = applySortAndFilter(okResult, { mode: "free", sort: "price", minSavings: 50 });
    expect(out).toBe(okResult);
  });

  it("ok=false 的结果原样返回", () => {
    const failResult = { ok: false, items: [] };
    expect(applySortAndFilter(failResult, { mode: "deals", sort: "savings", minSavings: 0 })).toBe(failResult);
  });
});
