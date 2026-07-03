// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { ResultTable } from "../../../src/renderer/stocks/ResultTable.jsx";
import { results } from "../../../src/renderer/stocks/stockStore.js";
import { stockDiagnosisCode, stockActiveTab } from "../../../src/renderer/stocks/diagnosisStore.js";

vi.mock("../../../src/renderer/api.js", () => ({ api: {} }));
afterEach(() => { cleanup(); results.value = []; stockDiagnosisCode.value = null; stockActiveTab.value = "screen"; });

describe("ResultTable 诊断按钮", () => {
  it("每行末尾有「诊断」按钮", () => {
    results.value = [
      { code: "300750", name: "宁德时代", price: 218, changePct: 2.3, pe: 28, roe: 24, industry: "电池" },
      { code: "600519", name: "贵州茅台", price: 1680, changePct: -0.5, pe: 35, roe: 30, industry: "白酒" },
    ];
    const { container } = render(<ResultTable api={{}} />);
    const btns = container.querySelectorAll('[data-testid="diagnosis-btn"]');
    expect(btns.length).toBe(2);
  });
  it("点击诊断按钮 → stockDiagnosisCode 设为该 code", () => {
    results.value = [{ code: "300750", name: "宁德时代", price: 218 }];
    const { container } = render(<ResultTable api={{}} />);
    fireEvent.click(container.querySelector('[data-testid="diagnosis-btn"]'));
    expect(stockDiagnosisCode.value).toBe("300750");
  });
});
