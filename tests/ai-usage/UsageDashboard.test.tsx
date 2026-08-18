/**
 * tests/ai-usage/UsageDashboard.test.jsx
 *
 * 渲染测试: UsageDashboard 组件根据 usageStats 字段展示数据.
 * 不测 CSS 样式 (样式在 styles.css 里, 视觉/Playwright 测).
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
const { UsageDashboard } = await import("../../src/renderer/components/UsageDashboard.tsx");

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

  test("仅有基础配额时显示深入分析的可解释占位", () => {
    const { container } = render(<UsageDashboard snapshot={{
      provider: "minimax",
      windows: { "5h": { usedPercent: 17, resetInSec: 3600 } },
    }} provider="minimax" />);

    const empty = container.querySelector(".ai-usage-insights-empty");
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain("暂无深入统计");
  });

  test("snapshot=null → 不渲染", () => {
    const { container } = render(<UsageDashboard snapshot={null} />);
    expect(container.querySelector(".ai-usage-dashboard")).toBe(null);
  });

  test("MiniMax 把主配额提升为页面顶部状态带", () => {
    const { container } = render(<UsageDashboard snapshot={{
      provider: "minimax",
      windows: {
        "5h": { usedPercent: 17, remainingPercent: 83, resetInSec: 3 * 3600 },
        weekly: { usedPercent: 28, remainingPercent: 72, resetInSec: 5 * 86400 },
      },
    }} provider="minimax" />);

    const hero = container.querySelector(".ai-usage-provider-hero--minimax");
    expect(hero).toBeTruthy();
    expect(hero.textContent).toContain("当前可用");
    expect(hero.textContent).toContain("83%");
    expect(hero.textContent).toContain("5 小时窗口");
    expect(hero.textContent).toContain("周窗口");
  });

  test("MiniMax 主状态带存在时不在补充资源区重复 5 小时和周额度", () => {
    const { container } = render(<UsageDashboard snapshot={{
      provider: "minimax",
      windows: {
        "5h": { usedPercent: 17, resetInSec: 3600 },
        weekly: { usedPercent: 28, resetInSec: 86400 },
      },
    }} provider="minimax" />);

    expect(container.querySelector(".ai-usage-overview")).toBe(null);
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

  test("90 天趋势图: UsageTrendChart SVG 主线 + 7/30 天均值同时显示", () => {
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    // UsageTrendChart 接入后: CSS div 柱状图不再存在, 改为 SVG path
    expect(container.querySelectorAll(".ai-usage-daily-bar")).toHaveLength(0);
    // SVG 主线 (总用量序列) 存在
    expect(container.querySelector(".usage-trend__line-total")).toBeTruthy();
    // 趋势区容器 (ai-usage-trend) 仍渲染, 内含 SVG + 平均值
    const trend = container.querySelector(".ai-usage-trend");
    expect(trend).toBeTruthy();
    expect(trend.querySelector(".usage-trend__svg")).toBeTruthy();
    // 均值 chip 仍在头部
    expect(trend.querySelector(".ai-usage-trend-avg-label").textContent).toContain("7 天日均");
    expect(trend.querySelectorAll(".ai-usage-trend-avg-label")).toHaveLength(2);
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

  // ─── 用量 KPI 卡 mini 折线 sparkline ───────────────────────────────

  test("累计消耗 + 连续使用 两张卡渲染 mini line sparkline", () => {
    // ponytail: 用 dailyTokenUsage 表达两个用量指标的趋势 — 累计消耗画每日 token 折线,
    // 连续使用画每日活跃度二值化折线. 其他两张 (统计周期 / 使用排名) 保持占位空 bar.
    const { container } = render(<UsageDashboard snapshot={{ usageSummary: SAMPLE }} />);
    // 总共应渲染 2 条 mini 折线 (累计 + 连续) — 其他 2 张没有 lineMode
    const lines = container.querySelectorAll(".ai-usage-overview-line");
    expect(lines).toHaveLength(2);
    // 每条 line 至少一个 path (area + stroke 共 2 个, 但 stroke 即可识别折线存在)
    const strokes = container.querySelectorAll(".ai-usage-overview-line-stroke");
    expect(strokes).toHaveLength(2);
    // 其他 2 张 (统计周期 / 使用排名) 仍然渲染占位空 bar
    const bars = container.querySelectorAll(".ai-usage-overview-bar");
    expect(bars).toHaveLength(2);
  });

  test("dailyTokenUsage 为空 → 折线渲染占位横线, 不崩", () => {
    const { container } = render(<UsageDashboard snapshot={{
      usageSummary: { ...SAMPLE, dailyTokenUsage: [] },
    }} />);
    const lines = container.querySelectorAll(".ai-usage-overview-line");
    expect(lines).toHaveLength(2);
    // 空数据时只有 empty line, 没有 stroke path
    const empties = container.querySelectorAll(".ai-usage-overview-line-empty");
    expect(empties).toHaveLength(2);
    expect(container.querySelector(".ai-usage-overview-line-stroke")).toBe(null);
  });

  test("dailyTokenUsage 缺失 → 折线仍渲染 (空态), 不崩", () => {
    const { container } = render(<UsageDashboard snapshot={{
      usageSummary: { ...SAMPLE, dailyTokenUsage: undefined },
    }} />);
    expect(container.querySelectorAll(".ai-usage-overview-line")).toHaveLength(2);
  });

  test("GLM 以三类额度和 MCP 工具分布替代 MiniMax 趋势分析", () => {
    const snapshot = {
      provider: "glm",
      level: "pro",
      windows: {
        "5h": {
          used: 120,
          total: 300,
          remaining: 180,
          usedPercent: 40,
          resetInSec: 3600,
        },
        weekly: {
          used: 900,
          total: 3000,
          remaining: 2100,
          usedPercent: 30,
          resetInSec: 86400,
        },
        mcp: {
          used: 12,
          total: 60,
          remaining: 48,
          usedPercent: 20,
          resetInSec: 7 * 86400,
        },
      },
      toolUsageDetails: [
        { modelCode: "search-prime", usage: 18 },
        { modelCode: "web-reader", usage: 9 },
      ],
    };

    const { container } = render(<UsageDashboard snapshot={snapshot} provider="glm" />);

    expect(container.querySelector(".ai-usage-dashboard--glm")).toBeTruthy();
    expect(container.querySelector(".ai-usage-glm-summary")).toBeTruthy();
    expect(container.textContent).toContain("5 小时 Token");
    expect(container.textContent).toContain("周 Token");
    expect(container.textContent).toContain("MCP 时长（本月）");
    expect(container.textContent).toContain("Pro");
    expect(container.textContent).toContain("search-prime");
    expect(container.textContent).toContain("web-reader");
    expect(container.querySelector(".ai-usage-trend")).toBe(null);
    expect(container.querySelector(".ai-usage-history-card")).toBe(null);
  });
});
