// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalHeader } from "../../../src/renderer/metals/MetalHeader.jsx";
import {
  config, quoteCache, fxCache, schedulerState, historyMap,
  selectedMetalId, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalHeader Phase 3: sparkline tabs", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("3 张总览卡 + 4 个 tab", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };

    const { container } = render(<MetalHeader />);
    expect(container.querySelectorAll(".overview-card").length).toBe(3);
    expect(container.querySelectorAll(".metals-metal-tab").length).toBe(4);
  });

  it("默认 selectedMetalId='XAU' → 第 1 个 tab 高亮 + aria-selected=true", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };

    const { container } = render(<MetalHeader />);
    const tabs = container.querySelectorAll(".metals-metal-tab");
    expect(tabs[0].className).toMatch(/is-selected/);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });

  it("data 齐全 → tab 内渲染 sparkline svg, change% 显示", () => {
    config.value = { watchedIds: ["XAU", "AU9999"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };
    historyMap.value = {
      XAU: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        close: 100 + i,
      })),
      AU9999: [{ date: "2026-05-01", close: 200 }],
      XAG: [],
      AG9999: [],
    };

    const { container } = render(<MetalHeader />);
    const tabs = container.querySelectorAll(".metals-metal-tab");
    expect(tabs[0].querySelector("svg")).not.toBeNull();
    expect(tabs[0].textContent).toMatch(/\+\d+\.\d+%/);
    expect(tabs[1].textContent).toMatch(/30 天加载中/);
  });

  it("点击 tab → selectedMetalId 切换, DetailTrend 内容同步", () => {
    config.value = { watchedIds: ["XAU", "AU9999"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };
    historyMap.value = {
      XAU: [{ date: "2026-05-01", close: 100 }, { date: "2026-05-30", close: 120 }],
      AU9999: [{ date: "2026-05-01", close: 200 }, { date: "2026-05-30", close: 220 }],
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
