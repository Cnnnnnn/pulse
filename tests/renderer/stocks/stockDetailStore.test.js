import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApi = {
  stocksSearch: vi.fn(),
  stocksDetailAngles: vi.fn(),
  stocksDetailAnalyze: vi.fn(),
};

const { codeInput, selectedStock, selectedAngles, perAngleData, aiResult, detailOpen,
  toggleAngle, selectStock, requestAiDetail, resetDetail } = await import(
  "../../../src/renderer/stocks/stockDetailStore.js"
);

beforeEach(() => {
  mockApi.stocksSearch.mockReset();
  mockApi.stocksDetailAngles.mockReset();
  mockApi.stocksDetailAnalyze.mockReset();
  codeInput.value = "";
  selectedStock.value = null;
  selectedAngles.value = new Set(["price_trend", "volume_turnover"]);
  perAngleData.value = {};
  aiResult.value = { status: "idle", result: null, fromCache: false, reason: null, error: null };
  detailOpen.value = false;
});

describe("toggleAngle", () => {
  it("adds angle key to set", () => {
    selectedAngles.value = new Set(["price_trend"]);
    toggleAngle("valuation");
    expect(selectedAngles.value.has("valuation")).toBe(true);
    expect(selectedAngles.value.has("price_trend")).toBe(true);
  });

  it("removes angle key if already present", () => {
    selectedAngles.value = new Set(["price_trend", "valuation"]);
    toggleAngle("valuation");
    expect(selectedAngles.value.has("valuation")).toBe(false);
    expect(selectedAngles.value.has("price_trend")).toBe(true);
  });
});

describe("selectStock", () => {
  it("sets selectedStock + clears perAngleData + aiResult", () => {
    perAngleData.value = { price_trend: { status: "ok", data: {} } };
    aiResult.value = { status: "ready", result: {} };
    selectStock({ code: "600519", name: "贵州茅台", industry: "白酒" });
    expect(selectedStock.value).toEqual({ code: "600519", name: "贵州茅台", industry: "白酒" });
    expect(perAngleData.value).toEqual({});
    expect(aiResult.value.status).toBe("idle");
  });
});

describe("requestAiDetail", () => {
  it("returns error signal when api missing", async () => {
    const r = await requestAiDetail(null, { code: "600519", angles: [], perAngleData: {} });
    expect(aiResult.value.status).toBe("error");
    expect(aiResult.value.reason).toBe("no_api");
  });

  it("success: writes aiResult + fromCache", async () => {
    mockApi.stocksDetailAnalyze.mockResolvedValue({
      ok: true,
      fromCache: true,
      result: { summary: "x", perAngle: {}, risks: [], signal: "neutral" },
    });
    await requestAiDetail(mockApi, { code: "600519", angles: ["price_trend"], perAngleData: {} });
    expect(aiResult.value.status).toBe("ready");
    expect(aiResult.value.fromCache).toBe(true);
    expect(mockApi.stocksDetailAnalyze).toHaveBeenCalledTimes(1);
  });

  it("failure: writes error state", async () => {
    mockApi.stocksDetailAnalyze.mockResolvedValue({ ok: false, reason: "budget_exceeded" });
    await requestAiDetail(mockApi, { code: "600519", angles: ["price_trend"], perAngleData: {} });
    expect(aiResult.value.status).toBe("error");
    expect(aiResult.value.reason).toBe("budget_exceeded");
  });
});