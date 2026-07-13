// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { MetalWatchlist } from "../../../src/renderer/metals/MetalWatchlist.jsx";
import {
  quoteCache, fxCache, historyMap, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";
import { watchlistItems } from "../../../src/renderer/watchlist/watchlist-store.js";

describe("MetalWatchlist: 行情榜 (单栏, 点行弹详情)", () => {
  beforeEach(() => {
    resetMetalStore();
    watchlistItems.value = [];
  });

  it("渲染 4 行 (XAU / XAG / AU9999 / AG9999) + 面板头", () => {
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: null, fetchedAt: null };
    historyMap.value = {};

    const { container } = render(<MetalWatchlist onSelect={() => {}} />);
    const rows = container.querySelectorAll(".metals-watch-row");
    expect(rows.length).toBe(4);
    expect(container.textContent).toMatch(/黄金/);
    expect(container.textContent).toMatch(/白银/);
    expect(container.textContent).toMatch(/AU9999/);
    expect(container.textContent).toMatch(/AG9999/);
    expect(container.querySelector(".metals-panel-head h2").textContent).toMatch(/行情/);
  });

  it("quote 缺失 → 价格列 skeleton + sparkline loading 文本", () => {
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const { container } = render(<MetalWatchlist onSelect={() => {}} />);
    const row = container.querySelectorAll(".metals-watch-row")[0];
    expect(row.querySelector(".metals-cell-skeleton")).not.toBeNull();
    expect(row.querySelector(".metals-wr-spark-loading")).not.toBeNull();
  });

  it("quote 存在 + history 30 天 → 渲染价格 + 涨跌 + sparkline svg", () => {
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

    const { container } = render(<MetalWatchlist onSelect={() => {}} />);
    const xauRow = container.querySelectorAll(".metals-watch-row")[0];
    expect(xauRow.querySelector(".metals-wr-price").textContent).toMatch(/¥/);
    expect(xauRow.querySelector(".metals-wr-chg").textContent).toMatch(/▲/);
    expect(xauRow.querySelector(".metals-wr-chg").textContent).toMatch(/%/);
    expect(xauRow.querySelector(".metals-wr-spark svg")).not.toBeNull();
  });

  it("上涨 → 涨跌块加 metals-up (红) + ▲; 下跌 → metals-down (绿) + ▼", () => {
    quoteCache.value = {
      data: {
        XAU: { id: "XAU", price: 1910, prevClose: 1890, change: 20, currency: "USD", unit: "oz" },
        XAG: { id: "XAG", price: 23, prevClose: 25, change: -2, currency: "USD", unit: "oz" },
      },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const { container } = render(<MetalWatchlist onSelect={() => {}} />);
    const xauChg = container.querySelectorAll(".metals-watch-row")[0].querySelector(".metals-wr-chg");
    const xagChg = container.querySelectorAll(".metals-watch-row")[1].querySelector(".metals-wr-chg");
    expect(xauChg.className).toMatch(/metals-up/);
    expect(xauChg.textContent).toMatch(/▲/);
    expect(xagChg.className).toMatch(/metals-down/);
    expect(xagChg.textContent).toMatch(/▼/);
  });

  it("点击行 → 调 onSelect(metalId) (弹详情)", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {}, fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    let selected = null;
    const { container } = render(<MetalWatchlist onSelect={(id) => { selected = id; }} />);
    const agRow = container.querySelectorAll(".metals-watch-row")[3];
    fireEvent.click(agRow);
    expect(selected).toBe("AG9999");
  });

  it("Enter / Space 键盘选中行 → 调 onSelect", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {}, fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    let selected = null;
    const { container } = render(<MetalWatchlist onSelect={(id) => { selected = id; }} />);
    const xagRow = container.querySelectorAll(".metals-watch-row")[1];
    fireEvent.keyDown(xagRow, { key: "Enter" });
    expect(selected).toBe("XAG");
  });

  it("★ 关注按钮点击 → 不触发行 onSelect (事件不冒泡)", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {}, fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    let selected = null;
    const { container } = render(<MetalWatchlist onSelect={(id) => { selected = id; }} />);
    const xauRow = container.querySelectorAll(".metals-watch-row")[0];
    const pin = xauRow.querySelector(".metals-pin");
    fireEvent.click(pin);
    expect(selected).toBeNull();
  });

  it("error → 行加 is-error 类 + 价格列显示失败", () => {
    quoteCache.value = {
      data: {},
      errors: { XAU: "timeout" },
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: null, fetchedAt: null };
    historyMap.value = {};

    const { container } = render(<MetalWatchlist onSelect={() => {}} />);
    const xauRow = container.querySelectorAll(".metals-watch-row")[0];
    expect(xauRow.className).toMatch(/is-error/);
    expect(xauRow.querySelector(".metals-wr-price").textContent).toMatch(/失败/);
  });
});
