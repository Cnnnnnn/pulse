/**
 * tests/main/food-aggregator.test.js
 *
 * Task 3: 纯函数合并 + fuzzy match + 排序 单元测.
 * 12 case: 2 levenshtein + 4 fuzzyMatchName + 6 mergeFoodData.
 * (vitest 1.x 用 import, 不是 require)
 */

import { describe, it, expect } from "vitest";
import {
  mergeFoodData,
  levenshtein,
  fuzzyMatchName,
} from "../../src/main/food/food-aggregator.js";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });
  it("returns distance for different strings", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("fuzzyMatchName", () => {
  it("matches identical", () => {
    expect(fuzzyMatchName("麦当劳", "麦当劳")).toBe(true);
  });
  it("matches with includes", () => {
    expect(fuzzyMatchName("麦当劳(建国路店)", "麦当劳")).toBe(true);
  });
  it("matches with Levenshtein <=2", () => {
    expect(fuzzyMatchName("麦当郎", "麦当劳")).toBe(true);
  });
  it("rejects very different", () => {
    expect(fuzzyMatchName("肯德基", "麦当劳")).toBe(false);
  });
});

describe("mergeFoodData", () => {
  const pois = [
    { id: "a", name: "麦当劳(建国路店)", address: "建国路88号", location: { lat: 39.9, lng: 116.4 }, distance: 850, type: "西式快餐" },
    { id: "b", name: "海底捞", address: "光华路21号", location: { lat: 39.91, lng: 116.41 }, distance: 1200, type: "火锅" },
    { id: "c", name: "兰州拉面", address: "光华路22号", location: { lat: 39.91, lng: 116.41 }, distance: 1300, type: "面馆" },
  ];
  const ratings = [
    { name: "麦当劳", rating: 4.5, reviewCount: 328, avgPrice: 45 },
    { name: "海底捞", rating: 4.8, reviewCount: 1024, avgPrice: 120 },
  ];

  it("merges by fuzzy name match", () => {
    const r = mergeFoodData(pois, ratings);
    expect(r.list[0].name).toBe("麦当劳(建国路店)");
    expect(r.list[0].rating).toBe(4.5);
    expect(r.list[0].reviewCount).toBe(328);
    expect(r.list[0].avgPrice).toBe(45);
  });

  it("POI without rating match gets null fields", () => {
    const r = mergeFoodData(pois, ratings);
    const lamian = r.list.find((x) => x.name === "兰州拉面");
    expect(lamian.rating).toBeNull();
    expect(lamian.reviewCount).toBeNull();
    expect(lamian.avgPrice).toBeNull();
  });

  it("sorts by distance ascending by default", () => {
    const r = mergeFoodData(pois, ratings);
    expect(r.list.map((x) => x.name)).toEqual([
      "麦当劳(建国路店)",
      "海底捞",
      "兰州拉面",
    ]);
  });

  it("sorts by rating descending when requested", () => {
    const r = mergeFoodData(pois, ratings, { sortBy: "rating" });
    expect(r.list[0].name).toBe("海底捞"); // 4.8
    expect(r.list[1].name).toBe("麦当劳(建国路店)"); // 4.5
    // 兰州拉面 (rating=null) 排到最后
    expect(r.list[2].name).toBe("兰州拉面");
  });

  it("limits to 30 entries", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`, name: `店${i}`, address: "x", location: { lat: 0, lng: 0 }, distance: 100 + i, type: "x",
    }));
    const r = mergeFoodData(many, [], { limit: 30 });
    expect(r.list.length).toBe(30);
  });

  it("empty inputs return empty list", () => {
    expect(mergeFoodData([], []).list).toEqual([]);
  });

  it("uses provided locationLabel", () => {
    const r = mergeFoodData(pois, ratings, { locationLabel: "北京·国贸" });
    expect(r.locationLabel).toBe("北京·国贸");
  });
});
