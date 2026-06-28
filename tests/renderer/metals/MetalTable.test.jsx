// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalTable } from "../../../src/renderer/metals/MetalTable.jsx";
import {
  config, quoteCache, fxCache, historyMap, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalTable", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("渲染 4 行 (XAU / XAG / AU9999 / AG9999) + 6 列 header", () => {
    config.value = { watchedIds: [], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: null, fetchedAt: null };
    historyMap.value = {};

    const { container } = render(<MetalTable onEdit={() => {}} />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(4);
    const headers = container.querySelectorAll("thead th");
    expect(headers.length).toBe(6);
    expect(container.textContent).toMatch(/黄金/);
    expect(container.textContent).toMatch(/白银/);
    expect(container.textContent).toMatch(/AU9999/);
    expect(container.textContent).toMatch(/AG9999/);
  });

  it("quote 缺失 → 该行价格列 skeleton, sparkline 列 loading 文本", () => {
    config.value = { watchedIds: ["AG9999"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const { container } = render(<MetalTable onEdit={() => {}} />);
    // AG9999 行 (第 4 行) 含 skeleton
    const row = container.querySelectorAll("tbody tr")[3];
    expect(row.querySelector(".metals-cell-skeleton")).not.toBeNull();
    expect(row.textContent).toMatch(/30 天加载中/);
  });

  it("quote 存在 + history 30 天 → 渲染价格 + 涨跌 + sparkline svg", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = {
      data: { XAU: { id: "XAU", price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz", quoteTime: Date.now() } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        close: 100 + i,
      })),
    };

    const { container } = render(<MetalTable onEdit={() => {}} />);
    const xauRow = container.querySelectorAll("tbody tr")[0];
    // 价格列含 ¥ 符号
    expect(xauRow.querySelector(".metals-cell-price").textContent).toMatch(/¥/);
    // 涨跌列百分比
    expect(xauRow.querySelector(".metals-cell-change-pct").textContent).toMatch(/%/);
    // sparkline svg
    expect(xauRow.querySelector(".metals-cell-sparkline svg")).not.toBeNull();
  });

  it("上涨 → 价格 + 涨跌 + sparkline 都用 metals-up (红) 类", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = {
      data: { XAU: { id: "XAU", price: 1910, prevClose: 1890, change: 20, currency: "USD", unit: "oz", quoteTime: Date.now() } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-30", close: 120 },
      ],
    };

    const { container } = render(<MetalTable onEdit={() => {}} />);
    const xauRow = container.querySelectorAll("tbody tr")[0];
    expect(xauRow.querySelector(".metals-cell-price").className).toMatch(/metals-pos/);
    expect(xauRow.querySelector(".metals-cell-change-pct").className).toMatch(/metals-pos/);
  });

  it("holdings 有 → 持仓列显示数量 + 累计盈亏; 空 → '+ 录入持仓' 文字链", () => {
    config.value = {
      watchedIds: ["XAU"],
      holdings: { XAU: { quantity: 10, costPriceCNY: 500, costCurrency: "CNY", costPrice: 500 } },
      deletedIds: [],
    };
    quoteCache.value = {
      data: { XAU: { id: "XAU", price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz", quoteTime: Date.now() } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const { container } = render(<MetalTable onEdit={() => {}} />);
    const xauRow = container.querySelectorAll("tbody tr")[0];
    // 有持仓 → 显示数量 + pnl
    expect(xauRow.querySelector(".metals-cell-holding-qty").textContent).toMatch(/10/);
    expect(xauRow.querySelector(".metals-cell-holding-pnl")).not.toBeNull();

    // AG9999 行无持仓 → 显示 "+ 录入持仓"
    const agRow = container.querySelectorAll("tbody tr")[3];
    const link = agRow.querySelector(".metals-add-holding-text");
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/录入持仓/);
  });
});
