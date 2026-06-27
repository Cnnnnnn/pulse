// @vitest-environment happy-dom
/**
 * tests/renderer/OverviewPage.test.jsx
 *
 * Task 18: OverviewPage — 整合 4 个 KPICard + TrendSparkline + WatchlistQuick +
 *          RecentTimeline + AIInsightsBlock, lazy 数据加载.
 *
 * 测试一个 case: 所有 section 都渲染. 用 mock api 防止 IPC 副作用.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { OverviewPage } from "../../src/renderer/components/OverviewPage.jsx";
import { resetOverview } from "../../src/renderer/overview-store.js";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    versionsOverviewKpis: vi.fn(async () => ({
      upgradable: 2, latest: 5, error: 1, total: 10,
    })),
    versionsOverviewTrend: vi.fn(async () => [1, 2, 3, 4, 3, 2, 1]),
    versionsOverviewWatchlist: vi.fn(async () => ([
      { name: "vscode", has_update: true },
    ])),
    versionsOverviewRecent: vi.fn(async () => ([
      { kind: "upgrade", appName: "vscode", ts: Date.now() },
    ])),
    versionsOverviewAiInsights: vi.fn(async () => ({
      ok: true, text: "本周升级活跃", fromCache: false,
    })),
  },
}));

beforeEach(() => {
  resetOverview();
});

describe("OverviewPage", () => {
  it("渲染 PageHeader + 4 KPI + WatchlistQuick + RecentTimeline + AIInsightsBlock", () => {
    render(<OverviewPage />);
    expect(screen.getByText("总览")).toBeTruthy();
    expect(screen.getByText("可升级")).toBeTruthy();
    expect(screen.getByText("最新")).toBeTruthy();
    expect(screen.getByText("出错")).toBeTruthy();
    expect(screen.getByText("总监控")).toBeTruthy();
    expect(screen.getByText("关注列表")).toBeTruthy();
    expect(screen.getByText("最近活动")).toBeTruthy();
    expect(screen.getByText("AI 摘要")).toBeTruthy();
  });
});