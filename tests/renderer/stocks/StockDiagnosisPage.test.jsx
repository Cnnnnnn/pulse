// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { StockDiagnosisPage } from "../../../src/renderer/stocks/StockDiagnosisPage.jsx";
import { stockDiagnosisCode, diagnosisState, diagnosisStock, closeDiagnosis } from "../../../src/renderer/stocks/diagnosisStore.js";

afterEach(() => { cleanup(); closeDiagnosis(); });

describe("StockDiagnosisPage", () => {
  it("渲染返回按钮 + 股票 hero (从 diagnosisStock 显示名字)", () => {
    stockDiagnosisCode.value = "300750";
    diagnosisStock.value = { code: "300750", name: "宁德时代", price: 218, changePct: 2.3 };
    diagnosisState.value = { status: "ready", perAngleData: {}, scores: { overall: 6.5, dimensions: {}, rationale: [] }, aiResult: { summary: "测试" }, error: null };
    const { container } = render(<StockDiagnosisPage api={{}} />);
    expect(container.textContent).toContain("宁德时代");
    expect(container.querySelector('[data-testid="diagnosis-back"]')).toBeTruthy();
  });
  it("loading 态显示加载指示", () => {
    stockDiagnosisCode.value = "300750";
    diagnosisState.value = { status: "loading", perAngleData: {}, scores: null, aiResult: null, error: null };
    const { container } = render(<StockDiagnosisPage api={{}} />);
    expect(container.textContent).toMatch(/加载|生成/i);
  });
});
