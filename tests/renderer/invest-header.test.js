/**
 * tests/renderer/invest-header.test.js
 *
 * 投资 nav 合并: InvestLayoutHeader 导出主级/二级 tab 常量, 组件本身含二级 sub-tabs 渲染.
 *
 * 2026-07-14 (计划 §1.2): 基金二级 tab 由 全部/自选 改为 概览/列表/交易.
 *   全部/自选 视图现保留为 fundView signal 的内部 list 页过滤,
 *   不再渲染在 Header 上 (Header 改用 fundPage 驱动).
 */
import { describe, it, expect } from "vitest";
import {
  INVEST_PRIMARY_TABS,
  FUND_VIEW_TABS,
  STOCK_VIEW_TABS,
} from "../../src/renderer/invest/InvestLayoutHeader.jsx";
import {
  FUND_PAGE_TABS,
} from "../../src/renderer/funds/fundRoute.js";

describe("invest header tabs", () => {
  it("primary has 3 modules (funds/metals/stocks)", () => {
    expect(INVEST_PRIMARY_TABS.map((t) => t.key)).toEqual([
      "funds",
      "metals",
      "stocks",
    ]);
  });

  it("fund secondary tabs = dashboard/list (plan §1.2)", () => {
    expect(FUND_VIEW_TABS.map((t) => t.key)).toEqual([
      "dashboard",
      "list",
    ]);
    expect(FUND_PAGE_TABS.map((t) => t.key)).toEqual([
      "dashboard",
      "list",
    ]);
    expect(FUND_VIEW_TABS.map((t) => t.label)).toEqual([
      "概览",
      "列表",
    ]);
  });

  it("stock secondary tabs = screen/diagnosis", () => {
    expect(STOCK_VIEW_TABS.map((t) => t.key)).toEqual([
      "screen",
      "diagnosis",
    ]);
  });
});
