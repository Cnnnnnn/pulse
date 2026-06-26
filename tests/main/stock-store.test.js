import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  loadStockWatchlist,
  addStock,
  removeStock,
  loadStockScreener,
  saveStockScreener,
} from "../../src/main/stock-store";
import { _setStatePathForTest } from "../../src/main/state-store";

// state-store 用模块级 _resolvedStatePath 单例. 每个用例给一个唯一路径,
// 并通过 statePath 显式传参 (避免依赖模块级默认路径在并发执行下串台).
function freshStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stock-test-"));
  return path.join(dir, "state.json");
}

describe("stock-store", () => {
  let p;
  beforeEach(() => {
    p = freshStatePath();
    _setStatePathForTest(p);
  });

  it("loadStockWatchlist returns [] when missing", () => {
    expect(loadStockWatchlist(p)).toEqual([]);
  });

  it("addStock appends with dedupe + returns new list", () => {
    const a = addStock({ code: "600519", name: "贵州茅台", industry: "食品饮料" }, p);
    expect(a).toHaveLength(1);
    expect(a[0].code).toBe("600519");
    expect(typeof a[0].addedAt).toBe("number");
    // 重复 code 忽略
    const b = addStock({ code: "600519", name: "贵州茅台" }, p);
    expect(b).toHaveLength(1);
    // 第二只
    const c = addStock({ code: "000001", name: "平安银行" }, p);
    expect(c).toHaveLength(2);
  });

  it("addStock rejects invalid code", () => {
    expect(() => addStock({ code: "123" }, p)).toThrow();
    expect(() => addStock({}, p)).toThrow();
  });

  it("addStock fills addedAt automatically", () => {
    const a = addStock({ code: "600519" }, p);
    expect(a[0].addedAt).toBeGreaterThan(0);
  });

  it("removeStock by code, idempotent", () => {
    addStock({ code: "600519", name: "贵州茅台" }, p);
    const after = removeStock("600519", p);
    expect(after).toHaveLength(0);
    const again = removeStock("600519", p); // 不存在不报错
    expect(again).toHaveLength(0);
  });

  it("persist across reload (state.json round-trip)", () => {
    addStock({ code: "600519", name: "贵州茅台", industry: "食品饮料" }, p);
    const reloaded = loadStockWatchlist(p);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].code).toBe("600519");
  });

  it("loadStockScreener returns defaults when missing", () => {
    const s = loadStockScreener(p);
    expect(s.activeStrategy).toBe("value_roe");
    expect(s.lastSort).toEqual({ key: "roe", dir: "desc" });
    expect(s.lastCriteria).toBe(null);
  });

  it("saveStockScreener persists + merges", () => {
    saveStockScreener(
      { lastCriteria: { peMax: 20, marketCapTier: "all", industries: [] } },
      p,
    );
    const s = loadStockScreener(p);
    expect(s.lastCriteria.peMax).toBe(20);
    expect(s.activeStrategy).toBe("value_roe"); // 默认仍在
    saveStockScreener({ activeStrategy: "custom" }, p);
    expect(loadStockScreener(p).activeStrategy).toBe("custom");
  });
});
