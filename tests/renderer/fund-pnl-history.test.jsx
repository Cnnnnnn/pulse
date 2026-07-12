// @vitest-environment happy-dom
// tests/renderer/fund-pnl-history.test.jsx
// T-B1: 盈亏记录面板 — 导出按钮在空态 disabled, 有数据时 enabled.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/preact";
import { FundPnlHistory } from "../../src/renderer/funds/FundPnlHistory.jsx";
import { dailySnapshots, selectedHistoryMonth } from "../../src/renderer/funds/fundStore.js";
import { ymShanghai } from "../../src/funds/fund-history.js";

afterEach(cleanup);

describe("FundPnlHistory 导出按钮 (T-B1)", () => {
  beforeEach(() => {
    selectedHistoryMonth.value = ymShanghai(new Date());
  });

  it("本月暂无记录 → 导出按钮 disabled 且 title=本月暂无记录", () => {
    dailySnapshots.value = [];
    render(<FundPnlHistory />);
    const btn = screen.getByLabelText("导出 CSV");
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("本月暂无记录");
  });

  it("有记录 → 导出按钮 enabled", () => {
    dailySnapshots.value = [
      { date: ymShanghai(new Date()) + "-10", todayProfit: 12.3, dayReturnPct: 0.5, totalMarketValue: 10000 },
      { date: ymShanghai(new Date()) + "-09", todayProfit: -5, dayReturnPct: -0.2, totalMarketValue: 9980 },
    ];
    render(<FundPnlHistory />);
    const btn = screen.getByLabelText("导出 CSV");
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("title")).toBe("导出 CSV");
  });
});
