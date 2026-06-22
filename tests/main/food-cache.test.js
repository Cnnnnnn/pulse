/**
 * tests/main/food-cache.test.js
 *
 * Task 2: per-location TTL 内存缓存 (LRU) 单元测.
 * 用 vi.useFakeTimers 验证 TTL, 走 Map 插入顺序做 LRU.
 * (vitest 1.x 必须用 import, 不能用 require — 已从 plan 改写)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFoodCache } from "../../src/main/food/food-cache.js";

describe("food-cache", () => {
  let cache;
  beforeEach(() => {
    vi.useFakeTimers();
    cache = createFoodCache({ ttlMs: 1000, maxEntries: 3 });
  });
  afterEach(() => vi.useRealTimers());

  it("returns null on miss", () => {
    expect(cache.get("k1")).toBeNull();
  });

  it("stores and retrieves value", () => {
    cache.set("k1", { x: 1 });
    expect(cache.get("k1")).toEqual({ x: 1 });
  });

  it("expires after TTL", () => {
    cache.set("k1", { x: 1 });
    vi.advanceTimersByTime(1500);
    expect(cache.get("k1")).toBeNull();
  });

  it("respects custom TTL per set", () => {
    cache.set("k1", { x: 1 }, 500);
    vi.advanceTimersByTime(800);
    expect(cache.get("k1")).toBeNull();
  });

  it("LRU evicts oldest when full", () => {
    cache.set("k1", 1);
    cache.set("k2", 2);
    cache.set("k3", 3);
    cache.get("k1"); // k1 is now most recent
    cache.set("k4", 4); // should evict k2 (oldest)
    expect(cache.get("k2")).toBeNull();
    expect(cache.get("k1")).toBe(1);
  });

  it("delete and clear work", () => {
    cache.set("k1", 1);
    cache.delete("k1");
    expect(cache.get("k1")).toBeNull();
    cache.set("k2", 2);
    cache.clear();
    expect(cache.get("k2")).toBeNull();
  });

  it("size tracks entries", () => {
    cache.set("k1", 1);
    cache.set("k2", 2);
    expect(cache.size()).toBe(2);
  });
});
