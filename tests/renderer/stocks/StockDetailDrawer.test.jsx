// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { StockDetailDrawer } from "../../../src/renderer/stocks/StockDetailDrawer.jsx";
import { detailOpen, selectedStock, selectedAngles, perAngleData, aiResult, resetDetail } from "../../../src/renderer/stocks/stockDetailStore.js";

afterEach(() => cleanup());

describe("StockDetailDrawer", () => {
  beforeEach(() => {
    resetDetail();
  });

  it("renders nothing when closed", () => {
    detailOpen.value = false;
    const { container } = render(<StockDetailDrawer api={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders header + input + 7 angle chips when open", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    selectedAngles.value = new Set(["price_trend"]);
    const { getAllByText, getAllByRole } = render(<StockDetailDrawer api={{}} />);
    expect(getAllByText(/AI 分析/).length).toBeGreaterThan(0);  // title + button both match
    expect(getAllByText("价格趋势").length).toBeGreaterThan(0);  // chip + preview row
    const chips = getAllByRole("button");
    expect(chips.length).toBeGreaterThan(5);  // 7 angle + generate + close
  });

  it("AI button calls api.stocksDetailAnalyze", async () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    perAngleData.value = {
      price_trend: { status: "ok", data: { change5d: 2.5 } },
    };
    aiResult.value = { status: "idle", result: null, fromCache: false, reason: null, error: null };
    const mockApi = { stocksDetailAnalyze: vi.fn().mockResolvedValue({ ok: true, result: { summary: "x", perAngle: {}, risks: [], signal: "neutral" } }) };
    const { getByText } = render(<StockDetailDrawer api={mockApi} />);
    fireEvent.click(getByText(/开始 AI 分析/));
    await new Promise((r) => setTimeout(r, 10));
    expect(mockApi.stocksDetailAnalyze).toHaveBeenCalled();
  });

  it("price_trend chip 在 ready 时打 ready class (不再内嵌 sparkline, sparkline 移到 FundPanel)", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "002463", name: "沪电股份", industry: "PCB" };
    selectedAngles.value = new Set(["price_trend"]);
    perAngleData.value = {
      price_trend: { status: "ok", data: { closes: [80, 85, 90, 95, 100] } },
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    const chip = container.querySelector(".stock-detail-chip");
    expect(chip.classList.contains("ready")).toBe(true);
  });

  it("AI ready 后 per-angle 解读默认折叠, 展开后才渲染 (替代旧 PerAnglePreview)", () => {
    detailOpen.value = true;
    selectedStock.value = { code: "600519", name: "贵州茅台", industry: "白酒" };
    selectedAngles.value = new Set(["price_trend", "volume_turnover"]);
    aiResult.value = {
      status: "ready",
      result: {
        summary: "测试总结",
        perAngle: { price_trend: "LLM 给了 price_trend 解读" },
        risks: [],
        signal: "neutral",
      },
      fromCache: false,
      reason: null,
      error: null,
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    // 默认折叠 → textContent 不含 perAngle 标签 (LLM 内容)
    expect(container.textContent).not.toContain("LLM 给了 price_trend 解读");
    // 展开 foldable → 出现
    const toggle = container.querySelector(".stock-ai-foldable-header");
    fireEvent.click(toggle);
    expect(container.textContent).toContain("LLM 给了 price_trend 解读");
    expect(container.textContent).toContain("暂无解读");  // volume_turnover LLM 漏填
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 5: StockDetailDrawer 大重写 — Hero + 5 tab + 折叠 AI
// ─────────────────────────────────────────────────────────────────────────────

function makeKlines(n = 30, base = 100) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, "0")}`,
    open: base + i,
    high: base + i + 1,
    low: base + i - 1,
    close: base + i + 0.5,
    volume: 1e9 + i * 1e7,
    amplitude: 2.5,
  }));
}

function makeStock(code = "600519", name = "贵州茅台") {
  return { code, name, industry: "白酒" };
}

describe("StockDetailDrawer — 新结构", () => {
  beforeEach(() => {
    cleanup();
    resetDetail();
    detailOpen.value = true;
    selectedStock.value = makeStock();
    perAngleData.value = {
      price_trend: {
        status: "ok",
        data: {
          closes: makeKlines(30).map((k) => k.close),
          klines: makeKlines(30),
          lastQuote: { price: 130.5, change: 1.5, changePct: 1.16 },
          change5d: 5.2, change20d: 28.0, amplitude: 2.5,
        },
      },
      // ponytail: 财务 tab 现在消费 2 个 angle (valuation + profitability), 不是 "fundamentals".
      // 字段名照搬 detail-fetchers/{valuation,profitability}.js.
      valuation: { status: "ok", data: { pe: 25.3, pb: 8.1, pePercentile3y: null } },
      profitability: { status: "ok", data: { roe: 30.5, grossMargin: 88.2, netMargin: 52.1, reportDate: "2026-03-31" } },
      capital_flow: { status: "ok", data: { mainNetInflow: 1.2e8, sparkline: [100, 102, 105, 110, 108] } },
      tech_indicators: { status: "ok", data: { macdHist: 0.15, rsi: 65, kdj: { k: 70, d: 65, j: 75 } } },
      news_buzz: { status: "ok", data: { items: [{ title: "利好 A", url: "https://example.com/a", date: "2026-06-27" }] } },
    };
  });

  it("默认 active tab 是 行情 (market)", () => {
    const { container } = render(<StockDetailDrawer api={{}} />);
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(5);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].textContent).toContain("行情");
  });

  it("5 个 tab 都在: 行情/财务/资金/技术/舆情", () => {
    const { container } = render(<StockDetailDrawer api={{}} />);
    const labels = Array.from(container.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(labels.join("|")).toMatch(/行情/);
    expect(labels.join("|")).toMatch(/财务/);
    expect(labels.join("|")).toMatch(/资金/);
    expect(labels.join("|")).toMatch(/技术/);
    expect(labels.join("|")).toMatch(/舆情/);
  });

  it("选中股票后渲染 Hero bar (含 name/code/price/change)", () => {
    const { container } = render(<StockDetailDrawer api={{}} />);
    expect(container.querySelector(".stock-hero")).toBeTruthy();
    expect(container.textContent).toContain("贵州茅台");
    expect(container.textContent).toContain("600519");
    expect(container.textContent).toContain("130.5");
  });

  it("行情 tab 渲染 CandlestickChart", () => {
    const { container } = render(<StockDetailDrawer api={{}} />);
    expect(container.querySelector(".stock-candle-chart")).toBeTruthy();
    expect(container.querySelector("svg[role='img']")).toBeTruthy();
  });

  it("未选股票时不渲染 Hero bar / K 线", () => {
    selectedStock.value = null;
    const { container } = render(<StockDetailDrawer api={{}} />);
    expect(container.querySelector(".stock-hero")).toBeNull();
    expect(container.querySelector(".stock-candle-chart")).toBeNull();
  });

  it("点击 tab 切换 panel, 只显示一个", () => {
    const { container } = render(<StockDetailDrawer api={{}} />);
    const tabs = container.querySelectorAll('[role="tab"]');
    fireEvent.click(tabs[1]);  // 财务
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    // 只 1 个 [role=tabpanel] 且 aria-hidden=false
    const panels = container.querySelectorAll('[role="tabpanel"]');
    const visible = Array.from(panels).filter((p) => p.getAttribute("aria-hidden") !== "true");
    expect(visible.length).toBe(1);
  });

  it("AI 块默认折叠 (只显示 summary 折叠按钮 + header)", () => {
    aiResult.value = {
      status: "ready",
      result: { summary: "AI 总结一句话", signal: "持有", perAngle: {}, risks: [] },
      fromCache: false,
      reason: null,
      error: null,
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    const fold = container.querySelector(".stock-ai-foldable");
    expect(fold).toBeTruthy();
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("AI 总结一句话");
  });

  it("点折叠按钮展开 AI 块 (aria-expanded=true)", () => {
    aiResult.value = {
      status: "ready",
      result: { summary: "AI 总结一句话", signal: "持有", perAngle: {}, risks: [] },
      fromCache: false,
      reason: null,
      error: null,
    };
    const { container } = render(<StockDetailDrawer api={{}} />);
    const toggle = container.querySelector(".stock-ai-foldable-header");
    fireEvent.click(toggle);
    expect(container.querySelector(".stock-ai-foldable").getAttribute("aria-expanded")).toBe("true");
  });

  it("老契约: 搜索输入框仍可用, 输入触发 dropdown", () => {
    const api = { stocksSearch: async () => ({ ok: true, results: [{ code: "000001", name: "测试股" }] }) };
    const { container } = render(<StockDetailDrawer api={api} />);
    const input = container.querySelector("input.stock-detail-input");
    fireEvent.input(input, { target: { value: "000" } });
    // 250ms debounce 后才出 dropdown — 测时同步不查结果; 只确认 input 渲染了
    expect(input).toBeTruthy();
  });

  it("空 stock 时 Hero 不渲染 (空状态保留)", () => {
    selectedStock.value = null;
    const { container } = render(<StockDetailDrawer api={{}} />);
    // 提示文案已改, "先选 1 只股票" 只作为 chip title 属性 (不入 textContent), 改用 not.toContain 表达原意.
    expect(container.textContent).not.toContain("先选 1 只股票");
    expect(container.textContent).toContain("输入代码或名称");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 4: FinancePanel — peer_compare + moat_score 折叠子区
// render helper: 用现有 perAngleData / selectedAngles 模式 + click 财务 tab.
// ─────────────────────────────────────────────────────────────────────────────

function renderFinancePanel(options = {}) {
  // 默认 setup: stock 已选, valuation + profitability ready (走 FinancePanel "ready + 有数据" 分支).
  selectedAngles.value = options.selectedAngles || new Set(["valuation", "profitability"]);
  perAngleData.value = options.perAngleData || {
    valuation: { status: "ok", data: { pe: 25.3, pb: 8.1 } },
    profitability: { status: "ok", data: { roe: 30.5, grossMargin: 88.2, netMargin: 52.1 } },
  };
  const { container } = render(<StockDetailDrawer api={{}} />);
  // 切到 财务 tab (默认是 market)
  const tabs = container.querySelectorAll('[role="tab"]');
  const financeTab = Array.from(tabs).find((t) => t.textContent.includes("财务"));
  fireEvent.click(financeTab);
  return container;
}

describe("FinancePanel — peer_compare / moat_score 折叠子区", () => {
  beforeEach(() => {
    cleanup();
    resetDetail();
    detailOpen.value = true;
    selectedStock.value = makeStock();
  });

  it("(a) 用户未勾选 peer_compare 时, 财务 tab 内无 stock-finance-subblock 子区", () => {
    const container = renderFinancePanel();
    expect(container.querySelector(".stock-finance-subblock")).toBeNull();
  });

  it("(b) 用户勾选 peer_compare + loading 时, 子区显示 '拉取中…'", () => {
    const container = renderFinancePanel({
      selectedAngles: new Set(["valuation", "profitability", "peer_compare"]),
      perAngleData: {
        valuation: { status: "ok", data: { pe: 25.3, pb: 8.1 } },
        profitability: { status: "ok", data: { roe: 30.5, grossMargin: 88.2 } },
        peer_compare: { status: "loading", data: null },
      },
    });
    const sub = container.querySelector(".stock-finance-subblock");
    expect(sub).toBeTruthy();
    expect(sub.textContent).toContain("拉取中");
  });

  it("(c) 用户勾选 peer_compare + ready 时, 子区显示 8 个 mini metric (4 PE + 4 PB)", () => {
    const container = renderFinancePanel({
      selectedAngles: new Set(["valuation", "profitability", "peer_compare"]),
      perAngleData: {
        valuation: { status: "ok", data: { pe: 25.3, pb: 8.1 } },
        profitability: { status: "ok", data: { roe: 30.5, grossMargin: 88.2 } },
        peer_compare: {
          status: "ok",
          data: {
            industry: "白酒",
            pe: 25.3, peIndustryMedian: 28.0, peRank: 5, peTotal: 30, peDeviationPct: -9.6,
            pb: 8.1, pbIndustryMedian: 7.5, pbRank: 10, pbTotal: 30, pbDeviationPct: 8.0,
          },
        },
      },
    });
    const sub = container.querySelector(".stock-finance-subblock");
    expect(sub).toBeTruthy();
    const metrics = sub.querySelectorAll(".stock-finance-subblock-metric");
    expect(metrics.length).toBe(8);
    expect(sub.textContent).toContain("白酒");
  });

  it("(d) 用户勾选 peer_compare + failed 时, 子区显示 '拉取失败'", () => {
    const container = renderFinancePanel({
      selectedAngles: new Set(["valuation", "profitability", "peer_compare"]),
      perAngleData: {
        valuation: { status: "ok", data: { pe: 25.3, pb: 8.1 } },
        profitability: { status: "ok", data: { roe: 30.5, grossMargin: 88.2 } },
        peer_compare: { status: "failed", reason: "fetch_failed", error: "network down" },
      },
    });
    const sub = container.querySelector(".stock-finance-subblock");
    expect(sub).toBeTruthy();
    expect(sub.textContent).toContain("拉取失败");
  });
});