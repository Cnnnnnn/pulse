// @vitest-environment happy-dom
/**
 * tests/renderer/stocks/StockLayout.test.jsx
 *
 * StockLayout 容器 (顶栏 + subtab + 主体).
 *   - subtab: WAI-ARIA tablist 模式 (role=tablist/tab, aria-selected, 键盘 ←→)
 *   - panel:  role=tabpanel, aria-labelledby 关联到对应 tab
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { StockLayout } from "../../../src/renderer/stocks/StockLayout.jsx";
import { stockActiveTab } from "../../../src/renderer/stocks/diagnosisStore.js";
import { results } from "../../../src/renderer/stocks/stockStore.js";

vi.mock("../../../src/renderer/api.js", () => ({ api: { stocksScreen: vi.fn() } }));

beforeEach(() => {
  stockActiveTab.value = "screen";
  results.value = [];
});
afterEach(() => {
  cleanup();
  stockActiveTab.value = "screen";
  results.value = [];
});

describe("StockLayout UX-2 subtab a11y", () => {
  it("subtab 容器 role=tablist, 两个 tab role=tab, aria-selected 跟随 active", () => {
    const { container } = render(<StockLayout />);
    const list = container.querySelector('[role="tablist"]');
    expect(list).toBeTruthy();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    // 默认 active = 'screen' → 第 1 个 selected=true
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    // 切到 diagnosis
    fireEvent.click(tabs[1]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  });

  it("subtab 点击 → 对应 panel 显示 (tabpanel aria-labelledby 关联)", () => {
    const { container } = render(<StockLayout />);
    const screenPanel = container.querySelector('#stock-panel-screen[role="tabpanel"]');
    const diagPanel = container.querySelector('#stock-panel-diagnosis[role="tabpanel"]');
    expect(screenPanel).toBeTruthy();
    expect(screenPanel.getAttribute("aria-labelledby")).toBe("stock-tab-screen");
    // 默认 active=screen, panel-screen 存在
    expect(screenPanel).toBeTruthy();
    // 切到 diagnosis
    fireEvent.click(container.querySelectorAll('[role="tab"]')[1]);
    const screenPanel2 = container.querySelector('#stock-panel-screen[role="tabpanel"]');
    const diagPanel2 = container.querySelector('#stock-panel-diagnosis[role="tabpanel"]');
    expect(diagPanel2).toBeTruthy();
    expect(diagPanel2.getAttribute("aria-labelledby")).toBe("stock-tab-diagnosis");
  });

  it("subtab 键盘 ← → 切换 active", () => {
    const { container } = render(<StockLayout />);
    const tabs = container.querySelectorAll('[role="tab"]');
    // 第 1 个 (screen) 初始 active. focus 它.
    tabs[0].focus();
    // 按 ArrowRight → 切到 diagnosis
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(stockActiveTab.value).toBe("diagnosis");
    // 按 ArrowLeft → 切回 screen
    fireEvent.keyDown(tabs[1], { key: "ArrowLeft" });
    expect(stockActiveTab.value).toBe("screen");
  });

  it("subtab 键盘 Home / End 跳首尾", () => {
    const { container } = render(<StockLayout />);
    const tabs = container.querySelectorAll('[role="tab"]');
    tabs[1].focus();
    stockActiveTab.value = "diagnosis";
    // 按 Home → 第 1 个 (screen)
    fireEvent.keyDown(tabs[1], { key: "Home" });
    expect(stockActiveTab.value).toBe("screen");
    // 按 End → 第 2 个 (diagnosis)
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(stockActiveTab.value).toBe("diagnosis");
  });
});
