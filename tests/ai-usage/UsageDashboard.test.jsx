/**
 * tests/ai-usage/UsageDashboard.test.jsx
 *
 * 渲染测试: UsageDashboard 组件根据 usageStats 字段展示数据.
 * 不测 CSS 样式 (样式在 styles.css 里, 视觉/Playwright 测).
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
const { UsageDashboard } = await import("../../src/renderer/components/UsageDashboard.jsx");

beforeEach(cleanup);

const SAMPLE = {
  totalDays: 90,
  totalTokenConsumed: 7_450_000_000,
  usageRankingPercent: 1,
  activeDays: 90,
  currentConsecutiveDays: 90,
  lastUpdateTime: "07-11 00:00",
  mostActiveDay: {
    date: "2026-06-07",
    tokenCount: 452_780_000,
    imageCount: 0,
    videoCount: 0,
    musicCount: 0,
    voiceCharacterCount: 0,
  },
  dailyTokenUsage: Array.from({ length: 90 }, (_, i) => 10_000_000 + i * 1_000_000),
  dateModelUsage: [
    { date: "2026-07-10", models: [
      { model: "MiniMax-M3-512k", totalToken: 879_600_096, cacheHitPercent: 96.33 },
      { model: "MiniMax-M2.7", totalToken: 6_787_710, cacheHitPercent: 67.13 },
    ], totals: { totalToken: 452_780_518 } },
  ],
  modelBreakdown: [
    { model: "MiniMax-M3-512k", totalToken: 879_600_096, sharePercent: 99.2 },
    { model: "MiniMax-M2.7", totalToken: 6_787_710, sharePercent: 0.8 },
  ],
  grandTotal: 886_387_806,
  recent7Avg: 123_456_789,
  recent30Avg: 87_654_321,
};

describe("UsageDashboard", () => {
  test("snapshot.usageSummary 缺 → 不渲染", () => {
    const { container } = render(<UsageDashboard snapshot={{ windows: {} }} />);
    expect(container.querySelector(".ai-usage-dashboard")).toBe(null);
  });

  test("snapshot=null → 不渲染", () => {
    const { container } = render(<UsageDashboard snapshot={null} />);
    expect(container.querySelector(".ai-usage-dashboard")).toBe(null);
  });

  test("渲染顶部概览条 (4 格)", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    const cells = container.querySelectorAll(".ai-usage-overview-cell");
    expect(cells).toHaveLength(4);
  });

  test("累计消耗: 7.45B → '7.45B' (紧凑格式保留 2 位小数)", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    expect(container.textContent).toContain("7.45B");
    // sub 字段显示完整千分位
    expect(container.textContent).toContain("7,450,000,000");
  });

  test("排名: usageRankingPercent=1 → 'Top 1%' 高亮", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    expect(container.textContent).toContain("Top 1%");
    const rankingCell = container.querySelector(".ai-usage-overview-cell--highlight");
    expect(rankingCell).toBeTruthy();
    expect(rankingCell.textContent).toContain("Top 1%");
  });

  test("排名: usageRankingPercent=50 → 不高亮", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: { ...SAMPLE, usageRankingPercent: 50 } }} />);
    expect(container.textContent).toContain("Top 50%");
    expect(container.querySelector(".ai-usage-overview-cell--highlight")).toBe(null);
  });

  test("最活跃日: 显示日期 + token 数", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    const mad = container.querySelector(".ai-usage-most-active");
    expect(mad).toBeTruthy();
    expect(mad.textContent).toContain("06-07");
    expect(mad.textContent).toContain("452.8M");
    expect(mad.textContent).toContain("tokens");
  });

  test("最活跃日: 有媒体计数 → 显示", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: {
      ...SAMPLE, mostActiveDay: { ...SAMPLE.mostActiveDay, imageCount: 5, videoCount: 3 }
    } }} />);
    expect(container.textContent).toContain("🖼 5");
    expect(container.textContent).toContain("🎬 3");
  });

  test("90 天柱状图: 渲染 90 根柱, 最近 7 根高亮", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    const bars = container.querySelectorAll(".ai-usage-daily-bar");
    expect(bars).toHaveLength(90);
    const recent = container.querySelectorAll(".ai-usage-daily-bar--recent");
    expect(recent).toHaveLength(7);
  });

  test("7 天/30 天均值显示", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    expect(container.textContent).toContain("7 天日均");
    expect(container.textContent).toContain("30 天日均");
    expect(container.textContent).toContain("123.5M");
    expect(container.textContent).toContain("87.7M");
  });

  test("模型分布: 按 sharePercent 降序, 显示 model 名 + 占比 + 紧凑 token", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    const rows = container.querySelectorAll(".ai-usage-model-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("MiniMax-M3-512k");
    expect(rows[0].textContent).toContain("99.2%");
    expect(rows[1].textContent).toContain("MiniMax-M2.7");
    expect(rows[1].textContent).toContain("0.8%");
  });

  test("dailyTokenUsage 缺 → 趋势区不渲染", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: { ...SAMPLE, dailyTokenUsage: [] } }} />);
    expect(container.querySelector(".ai-usage-trend")).toBe(null);
  });

  test("mostActiveDay.date 缺 → 最活跃日卡不渲染", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: {
      ...SAMPLE, mostActiveDay: { ...SAMPLE.mostActiveDay, date: null }
    } }} />);
    expect(container.querySelector(".ai-usage-most-active")).toBe(null);
  });

  test("modelBreakdown 缺 → 模型分布区不渲染", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: { ...SAMPLE, modelBreakdown: [] } }} />);
    expect(container.querySelector(".ai-usage-model-breakdown")).toBe(null);
  });
});