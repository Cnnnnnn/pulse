// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/preact";
import { FundCard } from "../../src/renderer/funds/FundCard.jsx";

const ROW = {
  holding: { id: "x", code: "000001", name: "测试基金", category: "stock", shares: 100, costNav: 1.0 },
  metrics: { usingEstimate: false, marketValue: 130, profit: 30, profitPct: 30, todayProfit: 5, costValue: 100 },
  navSnap: { nav: 1.3 },
};

afterEach(cleanup);

describe("FundCard (Task 9)", () => {
  it("渲染 code + 市值, 展开后显示份额", () => {
    render(<FundCard row={ROW} />);
    expect(screen.getByText("000001")).toBeTruthy();
    expect(screen.getByText("¥130.00")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("展开"));
    expect(screen.getByText("100.00")).toBeTruthy();
  });
});
