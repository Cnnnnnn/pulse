/**
 * tests/renderer/stocks/comparePool.test.js
 *
 * 对比池 store 行为 (signal-driven).
 * 重点: updateComparePrice 写回 reactive 价, 让 drawer / ResultTable "已在对比池" 角标
 *       同步看到最新价 (enrich fallback 写回).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  comparePool,
  compareIsFull,
  MAX_COMPARE,
  toggleCompare,
  removeFromCompare,
  clearCompare,
  updateComparePrice,
} from "../../../src/renderer/stocks/comparePool.js";

describe("comparePool store", () => {
  beforeEach(() => {
    clearCompare();
  });

  it("toggleCompare 缺 code → noop + reason", () => {
    const r = toggleCompare(null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_code");
  });

  it("toggleCompare 重复 code → toggle 移除", () => {
    toggleCompare({ code: "002463", name: "沪电股份" });
    expect(comparePool.value.length).toBe(1);
    const r = toggleCompare({ code: "002463", name: "沪电股份" });
    expect(r.action).toBe("removed");
    expect(comparePool.value.length).toBe(0);
  });

  it("满 4 只时再加 → 返 full, 不动旧数据", () => {
    for (let i = 0; i < MAX_COMPARE; i++) {
      toggleCompare({ code: String(600000 + i), name: `票${i}` });
    }
    expect(compareIsFull.value).toBe(true);
    const before = comparePool.value.slice();
    const r = toggleCompare({ code: "999999", name: "新" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("full");
    expect(comparePool.value).toEqual(before);
  });

  it("updateComparePrice 写回缺价 entry, 不动其他 entry", () => {
    toggleCompare({ code: "002463", name: "沪电股份" });
    toggleCompare({ code: "600519", name: "茅台", price: 1685 });
    updateComparePrice("002463", { price: 218, changePct: 2.3 });
    const next = comparePool.value;
    expect(next.find((e) => e.code === "002463")).toMatchObject({
      price: 218,
      changePct: 2.3,
    });
    // 已有的不被动
    expect(next.find((e) => e.code === "600519").price).toBe(1685);
  });

  it("updateComparePrice 不存在的 code → noop", () => {
    toggleCompare({ code: "002463", name: "沪电股份" });
    const before = comparePool.value;
    updateComparePrice("999999", { price: 1 });
    expect(comparePool.value).toBe(before); // 同引用 = 没改
  });

  it("removeFromCompare 按 code 删", () => {
    toggleCompare({ code: "002463", name: "沪电股份" });
    toggleCompare({ code: "600519", name: "茅台" });
    removeFromCompare("002463");
    expect(comparePool.value.map((e) => e.code)).toEqual(["600519"]);
  });
});
