// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/preact";
import { StockSearchInput } from "../../../src/renderer/stocks/StockSearchInput.jsx";
import {
  stockDiagnosisCode,
  stockActiveTab,
} from "../../../src/renderer/stocks/diagnosisStore.js";

beforeEach(() => {
  vi.useFakeTimers();
  stockDiagnosisCode.value = null;
  stockActiveTab.value = "screen";
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  stockDiagnosisCode.value = null;
  stockActiveTab.value = "screen";
});

// 工具: 输入 + 推进 debounce 定时器 + flush 微任务, 等搜索解析完成.
async function typeAndFlush(input, text, api) {
  fireEvent.input(input, { target: { value: text } });
  // debounce 250ms
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
  // 等待异步 stocksSearch promise resolve + 状态更新
  await act(async () => {
    vi.runAllTicks();
  });
}

describe("StockSearchInput", () => {
  it("输入触发 api.stocksSearch (debounce 250ms)", async () => {
    const api = {
      stocksSearch: vi.fn().mockResolvedValue({
        ok: true,
        results: [{ code: "600519", name: "贵州茅台" }],
      }),
    };
    const { container } = render(<StockSearchInput api={api} />);
    const input = container.querySelector(".stock-search-input");
    await typeAndFlush(input, "茅台", api);
    expect(api.stocksSearch).toHaveBeenCalledWith("茅台");
  });

  it("下拉显示 股票名 + 代码", async () => {
    const api = {
      stocksSearch: vi.fn().mockResolvedValue({
        ok: true,
        results: [
          { code: "600519", name: "贵州茅台" },
          { code: "000858", name: "五粮液" },
        ],
      }),
    };
    const { container } = render(<StockSearchInput api={api} />);
    const input = container.querySelector(".stock-search-input");
    await typeAndFlush(input, "酒", api);
    const items = container.querySelectorAll(".stock-search-item");
    expect(items.length).toBe(2);
    expect(container.textContent).toContain("贵州茅台");
    expect(container.textContent).toContain("600519");
    expect(container.textContent).toContain("五粮液");
  });

  it("点击下拉项 → 调 openDiagnosis(code) 并清空输入", async () => {
    const api = {
      stocksSearch: vi.fn().mockResolvedValue({
        ok: true,
        results: [{ code: "300750", name: "宁德时代" }],
      }),
    };
    const { container } = render(<StockSearchInput api={api} />);
    const input = container.querySelector(".stock-search-input");
    await typeAndFlush(input, "宁德", api);
    fireEvent.mouseDown(container.querySelector(".stock-search-item"));
    expect(stockDiagnosisCode.value).toBe("300750");
    expect(stockActiveTab.value).toBe("diagnosis");
    // 输入框清空
    expect(input.value).toBe("");
  });

  it("空结果 → 显示空结果态", async () => {
    const api = {
      stocksSearch: vi.fn().mockResolvedValue({ ok: true, results: [] }),
    };
    const { container } = render(<StockSearchInput api={api} />);
    const input = container.querySelector(".stock-search-input");
    await typeAndFlush(input, "不存在的股票", api);
    expect(container.textContent).toMatch(/无匹配结果/);
    expect(container.querySelectorAll(".stock-search-item").length).toBe(0);
  });

  it("搜索失败 → 显示错误态", async () => {
    const api = {
      stocksSearch: vi.fn().mockResolvedValue({ ok: false, reason: "boom" }),
    };
    const { container } = render(<StockSearchInput api={api} />);
    const input = container.querySelector(".stock-search-input");
    await typeAndFlush(input, "茅台", api);
    expect(container.textContent).toMatch(/搜索失败/);
  });

  it("ESC 关闭下拉", async () => {
    const api = {
      stocksSearch: vi.fn().mockResolvedValue({
        ok: true,
        results: [{ code: "600519", name: "贵州茅台" }],
      }),
    };
    const { container } = render(<StockSearchInput api={api} />);
    const input = container.querySelector(".stock-search-input");
    await typeAndFlush(input, "茅台", api);
    expect(container.querySelector(".stock-search-dropdown")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(container.querySelector(".stock-search-dropdown")).toBeNull();
  });

  it("debounce 内连续输入只发最后一次请求", async () => {
    const api = {
      stocksSearch: vi.fn().mockResolvedValue({ ok: true, results: [] }),
    };
    const { container } = render(<StockSearchInput api={api} />);
    const input = container.querySelector(".stock-search-input");
    // 连续输入, 不推进定时器
    fireEvent.input(input, { target: { value: "茅" } });
    fireEvent.input(input, { target: { value: "茅台" } });
    fireEvent.input(input, { target: { value: "茅台酒" } });
    expect(api.stocksSearch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    await act(async () => {
      vi.runAllTicks();
    });
    // 只调最后一次
    expect(api.stocksSearch).toHaveBeenCalledTimes(1);
    expect(api.stocksSearch).toHaveBeenCalledWith("茅台酒");
  });
});
