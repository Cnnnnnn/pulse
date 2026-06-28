// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalTrendStrip } from "../../../src/renderer/metals/MetalTrendStrip.jsx";
import {
  historyMap,
  selectedMetalId,
  resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";
import { METALS } from "../../../src/metals/metal-config.js";

describe("MetalTrendStrip", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("渲染 4 个 .metals-trend-cell", () => {
    const { container } = render(<MetalTrendStrip />);
    const cells = container.querySelectorAll(".metals-trend-cell");
    expect(cells.length).toBe(METALS.length);
  });

  it("点击第 3 个 cell → selectedMetalId 切到该品种", () => {
    const { container } = render(<MetalTrendStrip />);
    const cells = container.querySelectorAll(".metals-trend-cell");
    cells[2].click();
    expect(selectedMetalId.value).toBe(METALS[2].id);
  });

  it("historyMap 空 → 每个 cell 显示 '加载中' 文本", () => {
    const { container } = render(<MetalTrendStrip />);
    const skeletons = container.querySelectorAll(".metals-trend-cell-skeleton");
    expect(skeletons.length).toBe(METALS.length);
    expect(skeletons[0].textContent).toMatch(/加载中/);
  });

  it("historyMap 含 30 天 → 渲染 sparkline", () => {
    historyMap.value = {
      XAU: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        close: 100 + i,
      })),
    };
    const { container } = render(<MetalTrendStrip />);
    // XAU cell 含 svg, 其他 cell 仍是骨架
    const xauCell = container.querySelectorAll(".metals-trend-cell")[0];
    expect(xauCell.querySelector("svg")).not.toBeNull();
  });
});
