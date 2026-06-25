/**
 * tests/main/tray-stale.test.js
 *
 * Phase stale: "N 个 app 超过 7 天没新结果" 提示行.
 * 验证:
 *   - staleNames=[] → 不显示
 *   - staleNames=[3 个] → 显示 "3 个 app 超过 7 天没新结果 — 点击重检查", click 触发 onCheck
 *   - 显示在「打开面板」之前 (用户最容易看到的位置)
 */
import { describe, it, expect, vi } from "vitest";
import { _internal } from "../../src/main/tray.js";

const { buildMenu } = _internal;

const baseOpts = {
  results: [],
  aiUsage: null,
  worldcup: null,
  metals: null,
};

describe("tray.buildMenu — stale 提示行 (Phase stale)", () => {
  it("staleNames=[] → 不显示 stale 行", () => {
    const m = buildMenu({ ...baseOpts, staleNames: [] });
    const labels = m.map((i) => i.label).filter(Boolean);
    expect(labels.find((l) => l.includes("超过 7 天没新结果"))).toBeUndefined();
  });

  it("staleNames 不传 → 不显示 stale 行 (默认空数组)", () => {
    const m = buildMenu({ ...baseOpts });
    const labels = m.map((i) => i.label).filter(Boolean);
    expect(labels.find((l) => l.includes("超过 7 天没新结果"))).toBeUndefined();
  });

  it("staleNames=[3 个] → 显示 '3 个 app 超过 7 天没新结果 — 点击重检查'", () => {
    const m = buildMenu({ ...baseOpts, staleNames: ["a", "b", "c"] });
    const labels = m.map((i) => i.label).filter(Boolean);
    expect(labels).toContain("3 个 app 超过 7 天没新结果 — 点击重检查");
  });

  it("stale 行 click → 触发 onCheck (走重检查, 不走 onOpenPanel)", () => {
    const onCheck = vi.fn();
    const onOpenPanel = vi.fn();
    const m = buildMenu({
      ...baseOpts,
      staleNames: ["a"],
      onCheck,
      onOpenPanel,
    });
    const staleItem = m.find((i) => i.label && i.label.includes("超过 7 天没新结果"));
    expect(staleItem).toBeDefined();
    staleItem.click();
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).not.toHaveBeenCalled();
  });

  it("stale 行在「打开面板」之前 (优先看到)", () => {
    const m = buildMenu({ ...baseOpts, staleNames: ["a"] });
    const labels = m.map((i) => i.label).filter(Boolean);
    const staleIdx = labels.findIndex((l) => l.includes("超过 7 天没新结果"));
    const openPanelIdx = labels.indexOf("打开面板");
    expect(staleIdx).toBeGreaterThanOrEqual(0);
    expect(openPanelIdx).toBeGreaterThan(staleIdx);
  });

  it("stale 行后接 separator (跟其他 action 段一致的视觉风格)", () => {
    const m = buildMenu({ ...baseOpts, staleNames: ["a"] });
    const staleIdx = m.findIndex((i) => i.label && i.label.includes("超过 7 天没新结果"));
    expect(m[staleIdx + 1]).toEqual({ type: "separator" });
  });
});
