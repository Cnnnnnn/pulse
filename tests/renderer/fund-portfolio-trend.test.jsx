// @vitest-environment happy-dom
// tests/renderer/fund-portfolio-trend.test.jsx
// T-C1c: 组合走势 + 基准叠加 (第二条 path) / 降级 (benchmarkError) / 开关 aria-pressed.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/preact";
import {
  buildLinePath,
  buildAreaPath,
  recentTotals,
  buildDateMap,
  alignBenchmark,
  toPoints,
} from "../../src/renderer/funds/FundPortfolioTrend.jsx";
import { FundPortfolioTrend } from "../../src/renderer/funds/FundPortfolioTrend.jsx";
import {
  dailySnapshots,
  benchmarkEnabled,
  indexHistoryCache,
  benchmarkError,
  DEFAULT_BENCHMARK,
} from "../../src/renderer/funds/fundStore.js";

afterEach(() => {
  cleanup();
  dailySnapshots.value = [];
  benchmarkEnabled.value = true;
  indexHistoryCache.value = {};
  benchmarkError.value = null;
});

const SNAP = [
  { date: "2026-07-09", totalMarketValue: 100 },
  { date: "2026-07-10", totalMarketValue: 110 },
  { date: "2026-07-11", totalMarketValue: 105 },
];

describe("纯函数 helpers (T-C1c)", () => {
  it("buildDateMap 映射 date→value, 过滤无效 value", () => {
    const m = buildDateMap([{ date: "2026-07-10", value: 3300 }, { date: "2026-07-11", value: NaN }, null]);
    expect(m.get("2026-07-10")).toBe(3300);
    expect(m.size).toBe(1);
  });

  it("alignBenchmark 前向填充缺失日, leading 用首个有效值", () => {
    const dates = ["2026-07-09", "2026-07-10", "2026-07-11"];
    const m = buildDateMap([
      { date: "2026-07-10", value: 3300 },
      { date: "2026-07-11", value: 3310 },
    ]);
    expect(alignBenchmark(dates, m)).toEqual([3300, 3300, 3310]);
  });

  it("基准无数据 → alignBenchmark 返回 null", () => {
    expect(alignBenchmark(["2026-07-09"], new Map())).toBeNull();
  });

  it("toPoints 归一化到 viewBox", () => {
    const pts = toPoints([100, 110, 105], 300, 90, 6);
    expect(pts).toHaveLength(3);
    expect(pts[0].y).toBeGreaterThan(pts[1].y); // 值越大 y 越小 (图上方)
  });
});

describe("FundPortfolioTrend 基准叠加 (T-C1c)", () => {
  it("有基准缓存 → 渲染第二条基准 path", () => {
    dailySnapshots.value = SNAP;
    indexHistoryCache.value = {
      [DEFAULT_BENCHMARK]: [
        { date: "2026-07-09", value: 3300 },
        { date: "2026-07-10", value: 3320 },
        { date: "2026-07-11", value: 3310 },
      ],
    };
    const { container } = render(<FundPortfolioTrend />);
    const bench = container.querySelector(".fund-trend-bench");
    expect(bench).toBeTruthy();
    expect(bench.getAttribute("stroke-dasharray")).toBe("4 3");
    expect(bench.getAttribute("stroke")).toBe("var(--text-tertiary)");
  });

  it("benchmarkError 置位 → 不渲染基准 path, 显示「基准不可用」", () => {
    dailySnapshots.value = SNAP;
    indexHistoryCache.value = {
      [DEFAULT_BENCHMARK]: [{ date: "2026-07-09", value: 3300 }],
    };
    benchmarkError.value = "network";
    const { container } = render(<FundPortfolioTrend />);
    expect(container.querySelector(".fund-trend-bench")).toBeNull();
    expect(screen.getByText("基准不可用")).toBeTruthy();
  });

  it("关闭开关 → 不渲染基准 path (aria-pressed=false)", () => {
    dailySnapshots.value = SNAP;
    indexHistoryCache.value = {
      [DEFAULT_BENCHMARK]: [
        { date: "2026-07-09", value: 3300 },
        { date: "2026-07-10", value: 3320 },
        { date: "2026-07-11", value: 3310 },
      ],
    };
    const { container } = render(<FundPortfolioTrend />);
    expect(container.querySelector(".fund-trend-bench")).toBeTruthy();
    const toggle = screen.getByText("基准");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(benchmarkEnabled.value).toBe(false);
    expect(container.querySelector(".fund-trend-bench")).toBeNull();
  });
});
