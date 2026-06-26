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
});