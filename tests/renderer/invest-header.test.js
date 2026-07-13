/**
 * tests/renderer/invest-header.test.js
 *
 * 投资 nav 合并: InvestLayoutHeader 导出主级/二级 tab 常量, 组件本身含二级 sub-tabs 渲染.
 */
import { describe, it, expect } from "vitest";
import {
  INVEST_PRIMARY_TABS,
  FUND_VIEW_TABS,
  STOCK_VIEW_TABS,
} from "../../src/renderer/invest/InvestLayoutHeader.jsx";

describe("invest header tabs", () => {
  it("primary has 3 modules (funds/metals/stocks)", () => {
    expect(INVEST_PRIMARY_TABS.map((t) => t.key)).toEqual([
      "funds",
      "metals",
      "stocks",
    ]);
  });

  it("fund secondary tabs = all/watch", () => {
    expect(FUND_VIEW_TABS.map((t) => t.key)).toEqual(["all", "watch"]);
  });

  it("stock secondary tabs = screen/diagnosis", () => {
    expect(STOCK_VIEW_TABS.map((t) => t.key)).toEqual([
      "screen",
      "diagnosis",
    ]);
  });
});
