/**
 * tests/stocks/compare-kind.test.js
 *
 * 2026-07-13 投资 nav 合并: comparePool normalize 存 kind,
 *   跨模块加入 (fund/metal 走场内 ETF code) 时 kind 正确分类.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { toggleCompare, comparePool } from "../../src/renderer/stocks/comparePool.js";

describe("comparePool kind (2026-07-13 投资 nav 合并)", () => {
  beforeEach(() => {
    comparePool.value = [];
  });

  it("toggleCompare 保留 entry.kind (fund)", () => {
    toggleCompare({ kind: "fund", code: "161226", name: "国投白银LOF" });
    expect(comparePool.value).toHaveLength(1);
    expect(comparePool.value[0].kind).toBe("fund");
    expect(comparePool.value[0].code).toBe("161226");
  });

  it("toggleCompare 保留 entry.kind (metal)", () => {
    toggleCompare({ kind: "metal", code: "518880", name: "华安黄金ETF" });
    expect(comparePool.value[0].kind).toBe("metal");
  });

  it("旧 entry 无 kind → 默认 'stock' (向后兼容)", () => {
    toggleCompare({ code: "000001", name: "平安银行" });
    expect(comparePool.value[0].kind).toBe("stock");
  });

  it("同 compareCode (XAU/AU9999 → 518880) toggle 互斥 (去重行为)", () => {
    toggleCompare({ kind: "metal", code: "518880", name: "华安黄金ETF" });
    expect(comparePool.value).toHaveLength(1);
    // 加同 code (不同 metal id 也会去重) → 移除
    toggleCompare({ kind: "metal", code: "518880", name: "华安黄金ETF" });
    expect(comparePool.value).toHaveLength(0);
  });

  it("混 kind 入池: stock + fund + metal 共存", () => {
    toggleCompare({ kind: "stock", code: "000001", name: "平安银行" });
    toggleCompare({ kind: "fund", code: "161226", name: "国投白银LOF" });
    toggleCompare({ kind: "metal", code: "518880", name: "华安黄金ETF" });
    expect(comparePool.value.map((e) => e.kind).sort()).toEqual([
      "fund",
      "metal",
      "stock",
    ]);
  });
});
