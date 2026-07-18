import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dealsCacheKey,
  dealsCacheGet,
  dealsCacheSet,
  resetDealsCache,
  DEALS_CACHE_TTL_MS,
  ALLOWED_MODES,
} = require("../../../src/main/ipc/register-games.js");

beforeEach(() => resetDealsCache());

describe("dealsCacheKey", () => {
  it("不同参数组合生成不同 key", () => {
    const k1 = dealsCacheKey({ platform: "steam", mode: "deals", sort: "savings", minSavings: 0 });
    const k2 = dealsCacheKey({ platform: "steam", mode: "free", sort: "savings", minSavings: 0 });
    const k3 = dealsCacheKey({ platform: "epic", mode: "deals", sort: "savings", minSavings: 0 });
    const k4 = dealsCacheKey({ platform: "steam", mode: "deals", sort: "price", minSavings: 0 });
    const k5 = dealsCacheKey({ platform: "steam", mode: "deals", sort: "savings", minSavings: 50 });
    expect(new Set([k1, k2, k3, k4, k5]).size).toBe(5);
  });

  it("相同参数生成相同 key", () => {
    const k1 = dealsCacheKey({ platform: "all", mode: "free", sort: "savings", minSavings: 0 });
    const k2 = dealsCacheKey({ platform: "all", mode: "free", sort: "savings", minSavings: 0 });
    expect(k1).toBe(k2);
  });
});

describe("dealsCache TTL", () => {
  it("TTL 内命中缓存", () => {
    const key = dealsCacheKey({ platform: "steam", mode: "deals", sort: "savings", minSavings: 0 });
    const result = { ok: true, items: [{ id: "x" }], count: 1 };
    dealsCacheSet(key, result);
    expect(dealsCacheGet(key)).toBe(result);
  });

  it("过期后返回 null", () => {
    const key = dealsCacheKey({ platform: "steam", mode: "deals", sort: "savings", minSavings: 0 });
    dealsCacheSet(key, { ok: true, items: [] });

    vi.useFakeTimers();
    vi.advanceTimersByTime(DEALS_CACHE_TTL_MS + 1);
    expect(dealsCacheGet(key)).toBeNull();
    vi.useRealTimers();
  });

  it("未设置的 key 返回 null", () => {
    const key = dealsCacheKey({ platform: "epic", mode: "free", sort: "savings", minSavings: 0 });
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
