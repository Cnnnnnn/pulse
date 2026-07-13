// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { MetalDetail } from "../../../src/renderer/metals/MetalDetail.jsx";
import {
  quoteCache, fxCache, historyMap, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

// ModalShell usePortal → 渲染到 document.body, 不在 render() 返回的 container 里.
// 测试统一从 document.body 查询, 并在 afterEach 清理 body 避免泄漏.
function renderDetail(props) {
  render(<MetalDetail {...props} />);
  return document.body;
}

describe("MetalDetail: 详情弹窗 (点行弹出)", () => {
  beforeEach(() => {
    resetMetalStore();
    document.body.innerHTML = "";
  });
  afterEach && afterEach(() => { cleanup(); });

  it("渲染弹窗: 品种标题 + 现价 + 涨跌", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, changePct: 0.529, currency: "USD", unit: "oz" } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const body = renderDetail({ metalId: "XAU", onClose: () => {} });
    expect(body.querySelector(".metals-detail-modal-short").textContent).toMatch(/黄金/);
    expect(body.querySelector(".metals-detail-modal-full").textContent).toMatch(/现货黄金/);
    expect(body.querySelector(".metals-detail-quote-px").textContent).toMatch(/¥/);
  });

  it("按 metalId prop 显示对应品种", () => {
    quoteCache.value = {
      data: {
        XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" },
        AG9999: { price: 7.05, prevClose: 7.08, change: -0.03, currency: "CNY", unit: "g" },
      },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const body = renderDetail({ metalId: "AG9999", onClose: () => {} });
    expect(body.querySelector(".metals-detail-modal-short").textContent).toMatch(/AG9999/);
    expect(body.querySelector(".metals-detail-modal-full").textContent).toMatch(/白银/);
  });

  it("IndicatorGrid 渲染 3 格指标 (区间最高/最低/振幅)", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: [
        { date: "2026-06-01", open: 100, high: 108, low: 97, close: 105 },
        { date: "2026-06-02", open: 105, high: 112, low: 103, close: 110 },
      ],
    };

    const body = renderDetail({ metalId: "XAU", onClose: () => {} });
    const inds = body.querySelectorAll(".metals-ind");
    expect(inds.length).toBe(3);
    expect(inds[0].querySelector(".metals-ind-k").textContent).toMatch(/区间最高/);
    expect(inds[1].querySelector(".metals-ind-k").textContent).toMatch(/区间最低/);
    expect(inds[2].querySelector(".metals-ind-k").textContent).toMatch(/振幅/);
  });

  it("history 有完整 OHLC → ChartCard 渲染蜡烛图 SVG", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: Array.from({ length: 10 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        open: 100 + i, high: 102 + i, low: 98 + i, close: 101 + i,
      })),
    };

    const body = renderDetail({ metalId: "XAU", onClose: () => {} });
    const svg = body.querySelector(".metals-chart-area svg");
    expect(svg).not.toBeNull();
  });

  it("history 只有 close (无 OHLC) → 渲染面积折线图 (close 兜底)", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: Array.from({ length: 20 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        close: 100 + i,
      })),
    };

    const body = renderDetail({ metalId: "XAU", onClose: () => {} });
    const svg = body.querySelector(".metals-chart-area svg");
    expect(svg).not.toBeNull();
    expect(svg.querySelector("polyline")).not.toBeNull();
  });

  it("history 只有 close → 指标用 close 兜底算区间高/低 (不全 —)", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: Array.from({ length: 10 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        close: 100 + i, // 100..109
      })),
    };

    const body = renderDetail({ metalId: "XAU", onClose: () => {} });
    const inds = body.querySelectorAll(".metals-ind");
    expect(inds[0].querySelector(".metals-ind-v").textContent).toMatch(/109/);
    expect(inds[1].querySelector(".metals-ind-v").textContent).toMatch(/100/);
    expect(inds[2].querySelector(".metals-ind-v").textContent).toMatch(/%/);
  });

  it("区间切换 (日/周/月) → segmented control 可点", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {
      XAU: Array.from({ length: 20 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        open: 100 + i, high: 102 + i, low: 98 + i, close: 101 + i,
      })),
    };

    const body = renderDetail({ metalId: "XAU", onClose: () => {} });
    const segButtons = body.querySelectorAll(".metals-seg button");
    expect(segButtons.length).toBe(3);
    expect(segButtons[0].className).toMatch(/is-on/);
    fireEvent.click(segButtons[2]);
    expect(segButtons[2].className).toMatch(/is-on/);
    expect(segButtons[0].className).not.toMatch(/is-on/);
  });

  it("history 为空 → 图表区显示加载提示", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    historyMap.value = {};

    const body = renderDetail({ metalId: "XAU", onClose: () => {} });
    const empty = body.querySelector(".metals-chart-empty");
    expect(empty).not.toBeNull();
    expect(empty.textContent).toMatch(/加载中|数据不足/);
  });

  it("国际品种 + FX 缺失 → 显示汇率更新中提示", () => {
    quoteCache.value = {
      data: { XAU: { price: 1900, prevClose: 1890, change: 10, currency: "USD", unit: "oz" } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: null, fetchedAt: null };
    historyMap.value = {};

    const body = renderDetail({ metalId: "XAU", onClose: () => {} });
    expect(body.textContent).toMatch(/汇率更新中/);
  });

  it("关闭按钮 → 调 onClose", () => {
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: null, fetchedAt: null };
    historyMap.value = {};

    let closed = false;
    const body = renderDetail({ metalId: "XAU", onClose: () => { closed = true; } });
    fireEvent.click(body.querySelector(".metals-detail-modal-close"));
    expect(closed).toBe(true);
  });
});
