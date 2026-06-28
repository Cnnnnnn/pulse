// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalHeader } from "../../../src/renderer/metals/MetalHeader.jsx";
import {
  config, quoteCache, fxCache, schedulerState, historyMap,
  selectedMetalId, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalHeader 4 列布局", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("渲染 4 个 .overview-card (3 总览 + 1 trend)", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };

    const { container } = render(<MetalHeader />);
    const cards = container.querySelectorAll(".overview-card");
    expect(cards.length).toBe(4);
  });

  it("TrendStrip cell 含 4 个", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };

    const { container } = render(<MetalHeader />);
    const cells = container.querySelectorAll(".metals-trend-cell");
    expect(cells.length).toBe(4);
  });

  it("selectedMetalId 改变 → DetailTrend 内容同步切换", () => {
    config.value = { watchedIds: ["XAU", "AU9999"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };
    historyMap.value = {
      XAU: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-30", close: 120 },
      ],
      AU9999: [
        { date: "2026-05-01", close: 200 },
        { date: "2026-05-30", close: 220 },
      ],
    };

    selectedMetalId.value = "XAU";
    const { container, rerender } = render(<MetalHeader />);
    expect(container.textContent).toMatch(/现货黄金|黄金/);
    expect(container.textContent).toMatch(/\+20\.00%/);

    selectedMetalId.value = "AU9999";
    rerender(<MetalHeader />);
    expect(container.textContent).toMatch(/AU9999/);
  });
});
