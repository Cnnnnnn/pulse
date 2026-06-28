// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { StockDetailDrawer } from "../../../src/renderer/stocks/StockDetailDrawer.jsx";
import { detailOpen, selectedStock, selectedAngles, perAngleData, aiResult, resetDetail } from "../../../src/renderer/stocks/stockDetailStore.js";

afterEach(() => cleanup());

describe("StockDetailDrawer", () => {
  beforeEach(() => {
    resetDetail();
  });

  it("renders nothing when closed", () => {
    detailOpen.value = false;
    const { container } = render(<StockDetailDrawer api={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders header + input + 7 angle chips when open", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    selectedAngles.value = new Set(["price_trend"]);
    const { getAllByText, getAllByRole } = render(<StockDetailDrawer api={{}} />);
    expect(getAllByText(/AI 分析/).length).toBeGreaterThan(0);  // title + button both match
    expect(getAllByText("价格趋势").length).toBeGreaterThan(0);  // chip + preview row
    const chips = getAllByRole("button");
    expect(chips.length).toBeGreaterThan(5);  // 7 angle + generate + close
  });

  it("AI button calls api.stocksDetailAnalyze", async () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    perAngleData.value = {
      price_trend: { status: "ok", data: { change5d: 2.5 } },
    };
    aiResult.value = { status: "idle", result: null, fromCache: false, reason: null, error: null };
    const mockApi = { stocksDetailAnalyze: vi.fn().mockResolvedValue({ ok: true, result: { summary: "x", perAngle: {}, risks: [], signal: "neutral" } }) };
    const { getByText } = render(<StockDetailDrawer api={mockApi} />);
    fireEvent.click(getByText(/开始 AI 分析/));
    await new Promise((r) => setTimeout(r, 10));
    expect(mockApi.stocksDetailAnalyze).toHaveBeenCalled();
  });

  it("price_trend chip ready 状态下含 .stock-sparkline", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "002463", name: "沪电股份", industry: "PCB" };
    selectedAngles.value = new Set(["price_trend"]);
    perAngleData.value = {
      price_trend: { status: "ok", data: { closes: [80, 85, 90, 95, 100] } },
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    const chip = container.querySelector(".stock-detail-chip");
    expect(chip.querySelector("svg.stock-sparkline")).not.toBeNull();
  });

  it("price_trend preview ready row 含 .stock-sparkline (在文字上方)", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "002463", name: "沪电股份", industry: "PCB" };
    selectedAngles.value = new Set(["price_trend"]);
    perAngleData.value = {
      price_trend: { status: "ok", data: { closes: [80, 85, 90, 95, 100] } },
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    const previewRow = container.querySelector(".stock-detail-preview-row.status-ok");
    expect(previewRow.querySelector("svg.stock-sparkline")).not.toBeNull();
  });

  it("renders per-angle interpretation from selectedAngles (not LLM keys)", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    selectedAngles.value = new Set(["price_trend", "volume_turnover"]);
    // LLM 漏填/填错 key — 渲染端用 selectedAngles 兜底
    aiResult.value = {
      status: "ready",
      result: {
        summary: "测试总结",
        perAngle: { price_trend: "LLM 给了 price_trend 解读" },
        risks: [],
        signal: "neutral",
      },
      fromCache: false,
      reason: null,
      error: null,
    };
    const { getByText } = render(<StockDetailDrawer api={{}} />);
    const priceLi = getByText(/价格趋势:/).closest("li");
    expect(priceLi.textContent).toContain("LLM 给了 price_trend 解读");
    // volume_turnover LLM 没填 — 显示 "暂无解读"
    const volLi = getByText(/交易热度:/).closest("li");
    expect(volLi.textContent).toContain("暂无解读");
  });

  it("PerAnglePreview: ready angle 渲染 summarizeForAi 短文 (不需 AI)", () => {
    // ponytail: 用户选完股票后 angle 自动加载, 不必调 AI 也能看到数据观察.
    detailOpen.value = true;
    selectedStock.value = { code: "002463", name: "沪电股份", industry: "PCB" };
    selectedAngles.value = new Set(["price_trend", "valuation"]);
    perAngleData.value = {
      price_trend: {
        status: "ok",
        data: { closes: [80, 90, 100, 110, 120, 130, 140], change5d: 16.67, change20d: 50.0, amplitude: 3.5 },
      },
      valuation: {
        status: "ok",
        data: { pe: 230.4, pb: 16.88, pePercentile3y: null },
      },
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    // perAngleData 状态值是 "ok", UI 渲染成 .status-ok
    const previewRows = container.querySelectorAll(".stock-detail-preview-row.status-ok");
    expect(previewRows.length).toBe(2);
    const text = container.textContent;
    expect(text).toContain("累计");
    expect(text).toContain("PE 230.40 倍");
  });
});