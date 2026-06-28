// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalDetailTrend } from "../../../src/renderer/metals/MetalDetailTrend.jsx";
import {
  historyMap,
  selectedMetalId,
  resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalDetailTrend", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("空 historyMap → 显示 '30 天数据待刷新'", () => {
    selectedMetalId.value = "XAU";
    const { container } = render(<MetalDetailTrend />);
    expect(
      container.querySelector(".metals-detail-trend-empty"),
    ).not.toBeNull();
    expect(container.textContent).toMatch(/30 天数据待刷新/);
  });

  it("上涨 (起 < 终): 含 .metals-detail-trend-up + pct-up", () => {
    selectedMetalId.value = "AU9999";
    historyMap.value = {
      AU9999: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-30", close: 120 },
      ],
    };
    const { container } = render(<MetalDetailTrend />);
    const root = container.querySelector(".metals-detail-trend");
    expect(root.className).toMatch(/metals-detail-trend-up/);
    expect(container.querySelector(".metals-detail-trend-pct.pct-up")).not.toBeNull();
    expect(container.textContent).toMatch(/\+20\.00%/);
  });

  it("下跌 (起 > 终): 含 .metals-detail-trend-down + pct-down", () => {
    selectedMetalId.value = "XAU";
    historyMap.value = {
      XAU: [
        { date: "2026-05-01", close: 200 },
        { date: "2026-05-30", close: 180 },
      ],
    };
    const { container } = render(<MetalDetailTrend />);
    const root = container.querySelector(".metals-detail-trend");
    expect(root.className).toMatch(/metals-detail-trend-down/);
    expect(container.querySelector(".pct-down")).not.toBeNull();
  });

  it("渲染起/终/高/低/均/区间 6 个统计文本", () => {
    selectedMetalId.value = "AU9999";
    historyMap.value = {
      AU9999: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-15", close: 120 },
        { date: "2026-05-30", close: 110 },
      ],
    };
    const { container } = render(<MetalDetailTrend />);
    const stats = container.querySelector(".metals-detail-trend-stats");
    expect(stats.textContent).toMatch(/高/);
    expect(stats.textContent).toMatch(/低/);
    expect(stats.textContent).toMatch(/均/);
    expect(stats.textContent).toMatch(/区间/);
  });

  it("国际品种 XAU → 含 .metals-detail-trend-proxy 标签 '沪金2608代理'", () => {
    selectedMetalId.value = "XAU";
    historyMap.value = {
      XAU: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-30", close: 110 },
      ],
    };
    const { container } = render(<MetalDetailTrend />);
    expect(
      container.querySelector(".metals-detail-trend-proxy").textContent,
    ).toMatch(/沪金/);
  });
});
