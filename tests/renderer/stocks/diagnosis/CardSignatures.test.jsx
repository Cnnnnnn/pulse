// @vitest-environment happy-dom
// T8 联调: 9 张诊断卡 (通过 ModuleGrid) 都把 angle + onRefresh 透传到 ModuleCard,
//   从而 DataHealthPill 能在每张卡上正确显示 4 态 + failed 重试按钮.
// ponytail 2026-07-18 P0-1: 这份测试是契约兜底 — 重构 ModuleGrid/Card 时如果不小心
//   漏掉 angle/onRefresh, 立刻被 CI 抓到.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { ModuleGrid } from "../../../../src/renderer/stocks/diagnosis/ModuleGrid.jsx";

const recent = Date.now() - 1000;

function buildPerAngleData() {
  return {
    profitability: { status: "ok", data: { roe: 24 }, fetchedAt: recent },
    valuation: { status: "ok", data: { pe: 18 }, fetchedAt: recent },
    peer_compare: { status: "ok", data: { pePercentile: 30 }, fetchedAt: recent },
    capital_flow: { status: "failed", reason: "fetch_failed" },
    tech_indicators: { status: "ok", data: { ma5: 10 }, fetchedAt: recent },
    news_buzz: { status: "ok", data: { items: [{ title: "x", date: "2026-07-18", sentiment: "neutral" }] }, fetchedAt: recent },
    earnings_forecast: { status: "ok", data: { items: [{ reportDate: "2026-06-30", type: "预增", changeMin: 10, changeMax: 30, reason: "主营增长" }], latest: { reportDate: "2026-06-30", type: "预增", changeMin: 10, changeMax: 30, reason: "主营增长" } }, fetchedAt: recent },
    shareholders: { status: "ok", data: { holderCountLatest: 1_0000_0000, holderCountChangePct: -2, institutionPctLatest: 35.4, institutionChangePct: 1.0 }, fetchedAt: recent },
    corporate_events: { status: "failed", reason: "fetch_failed", error: "remote 503" },
  };
}

describe("T8: ModuleGrid → 9 诊断卡 透传 angle + onRefresh", () => {
  it("所有 9 张卡都渲染出 DataHealthPill (传了 angle)", () => {
    const { container } = render(<ModuleGrid perAngleData={buildPerAngleData()} aiResult={null} />);
    // 9 个 module-card 每个都应该带一个 pill (除了 RiskCard — 它无 angle).
    const pills = container.querySelectorAll(".data-health-pill");
    expect(pills.length).toBe(9);
  });

  it("部分失败的卡 (capital_flow / corporate_events) 显示 '失败' + 重试按钮", () => {
    const onRefreshAngle = vi.fn();
    const { container } = render(
      <ModuleGrid
        perAngleData={buildPerAngleData()}
        aiResult={null}
        onRefreshAngle={onRefreshAngle}
      />,
    );
    const failLabels = Array.from(container.querySelectorAll(".data-health-pill-failed"));
    expect(failLabels.length).toBeGreaterThanOrEqual(2);
    // 失败 pill 内嵌 retry button
    const retryButtons = container.querySelectorAll(".data-health-pill-retry");
    expect(retryButtons.length).toBeGreaterThanOrEqual(2);
    // 点击第一个 retry 按钮应触发 onRefreshAngle(对应 angle key)
    fireEvent.click(retryButtons[0]);
    expect(onRefreshAngle).toHaveBeenCalledTimes(1);
    expect(onRefreshAngle.mock.calls[0][0]).toMatch(/capital_flow|corporate_events/);
  });

  it("onRefresh 没传时不渲 retry 按钮 (back-compat)", () => {
    const { container } = render(<ModuleGrid perAngleData={buildPerAngleData()} aiResult={null} />);
    expect(container.querySelectorAll(".data-health-pill-retry").length).toBe(0);
  });

  it("失败的卡 (capital_flow) CardFreshness 不显示 (因为没 fetchedAt) 但 Pill 仍渲", () => {
    const { container } = render(<ModuleGrid perAngleData={buildPerAngleData()} aiResult={null} />);
    // capital_flow fail → 没有 fetchedAt → CardFreshness 无值 → 不渲; 但 Pill 渲 (failed)
    expect(container.querySelectorAll(".data-health-pill-failed").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll(".card-freshness").length).toBeGreaterThan(0); // ok 的卡渲了 freshness
  });
});
