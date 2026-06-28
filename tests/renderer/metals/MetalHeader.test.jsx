// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalHeader } from "../../../src/renderer/metals/MetalHeader.jsx";
import {
  config, quoteCache, fxCache, schedulerState, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalHeader Phase 4: status bar", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("status bar 渲染: 标题 + 3 总览数字 + 刷新按钮", () => {
    config.value = { watchedIds: ["XAU"], holdings: { XAU: null }, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };

    const { container } = render(<MetalHeader />);
    expect(container.querySelector(".metals-header-title").textContent).toMatch(/贵金属/);
    const summary = container.querySelectorAll(".metals-header-summary-item");
    expect(summary.length).toBe(3);
    expect(summary[0].textContent).toMatch(/总市值/);
    expect(summary[1].textContent).toMatch(/总盈亏/);
    expect(summary[2].textContent).toMatch(/今日预估/);
    expect(container.querySelector(".metals-refresh-btn")).not.toBeNull();
  });

  it("总盈亏 / 今日预估 为正 → 加 metals-pos 类 (红)", () => {
    // 构造 holdings + quote + fx 让 overview computed 算出正盈亏 + 正今日预估.
    // 公式: totalPnlCNY = MV - cost, todayEst = quote.change * fx * qty
    config.value = {
      watchedIds: ["XAU"],
      holdings: { XAU: { quantity: 10, costPriceCNY: 700 } }, // cost 7000
      deletedIds: [],
    };
    quoteCache.value = {
      data: {
        XAU: { price: 710, change: 5, currency: "USD" }, // MV=7100, pnl=+100, today=+5*7*10=+350
      },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: null };

    const { container } = render(<MetalHeader />);
    const values = container.querySelectorAll(".metals-header-summary-value");
    expect(values[1].className).toMatch(/metals-pos/);
    expect(values[2].className).toMatch(/metals-pos/);
  });
});
