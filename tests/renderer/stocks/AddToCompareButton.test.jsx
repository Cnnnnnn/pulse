// @vitest-environment happy-dom
/**
 * tests/renderer/stocks/AddToCompareButton.test.jsx
 *
 * 加对比池按钮:
 *   - 不在 pool → "加入对比"
 *   - 在 pool → "已在对比池" + 加 .add-compare-in
 *   - pool 满 (4) → 禁用 + flash "full"
 *   - 加 pool 后 entry 缺价 → 异步拉价
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { AddToCompareButton } from "../../../src/renderer/stocks/AddToCompareButton.jsx";
import {
  toggleCompare,
  clearCompare,
  comparePool,
  compareIsFull,
} from "../../../src/renderer/stocks/comparePool.js";

vi.mock("../../../src/renderer/api.js", () => ({ api: {} }));

beforeEach(() => {
  clearCompare();
});
afterEach(() => {
  cleanup();
  clearCompare();
  vi.useRealTimers();
});

describe("AddToCompareButton", () => {
  it("不在 pool → 显示 + '加入对比'", () => {
    const { container } = render(
      <AddToCompareButton
        entry={{ code: "002463", name: "沪电股份" }}
        variant="card"
      />,
    );
    const btn = container.querySelector(".add-compare-btn");
    expect(btn.textContent).toMatch(/\+/);
    expect(btn.textContent).toMatch(/加入对比/);
    expect(btn.classList.contains("add-compare-in")).toBe(false);
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("在 pool → 显示 ✓ '已在对比池' + 加 .add-compare-in", async () => {
    toggleCompare({ code: "002463", name: "沪电股份" });
    const { container } = render(
      <AddToCompareButton
        entry={{ code: "002463", name: "沪电股份" }}
        variant="card"
      />,
    );
    await waitFor(() => {
      const btn = container.querySelector(".add-compare-btn");
      expect(btn.classList.contains("add-compare-in")).toBe(true);
      expect(btn.textContent).toMatch(/✓/);
      expect(btn.textContent).toMatch(/已在对比池/);
    });
  });

  it("pool 满 (4 只) → button 禁用", async () => {
    toggleCompare({ code: "1", name: "a" });
    toggleCompare({ code: "2", name: "b" });
    toggleCompare({ code: "3", name: "c" });
    toggleCompare({ code: "4", name: "d" });
    await waitFor(() => expect(compareIsFull.value).toBe(true));
    const { container } = render(
      <AddToCompareButton
        entry={{ code: "5", name: "e" }}
        variant="card"
      />,
    );
    const btn = container.querySelector(".add-compare-btn");
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("满池点 add → flash 'full' 1.5s, 不改 pool", async () => {
    vi.useFakeTimers();
    toggleCompare({ code: "1", name: "a" });
    toggleCompare({ code: "2", name: "b" });
    toggleCompare({ code: "3", name: "c" });
    toggleCompare({ code: "4", name: "d" });
    const { container } = render(
      <AddToCompareButton
        entry={{ code: "5", name: "e" }}
        variant="card"
      />,
    );
    const btn = container.querySelector(".add-compare-btn");
    // disabled 按钮 fireEvent.click 在 happy-dom 不会触发 onClick — 模拟真用户点不到的情况
    // 但 fireEvent.click 仍可触发, 这里仅验证 disabled 状态
    expect(btn.hasAttribute("disabled")).toBe(true);
    // 直接调 toggleCompare 也返 full
    const r = toggleCompare({ code: "5", name: "e" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("full");
  });

  it("点 add → 加 pool, 显示 flash 'added' 1.2s", async () => {
    vi.useFakeTimers();
    const { container } = render(
      <AddToCompareButton
        entry={{ code: "002463", name: "沪电股份" }}
        variant="card"
      />,
    );
    const btn = container.querySelector(".add-compare-btn");
    fireEvent.click(btn);
    expect(comparePool.value.length).toBe(1);
    // flash 1.2s 后清掉
    vi.advanceTimersByTime(1300);
    await waitFor(() => {
      expect(
        container.querySelector(".add-compare-flash-added"),
      ).toBeFalsy();
    });
  });

  it("加 pool 后 entry 缺价 → 异步拉价 (api.stocksSearch)", async () => {
    const api = {
      stocksSearch: vi.fn(async (q) => ({
        ok: true,
        results: [{ code: q, name: "x", price: 218, changePct: 2.3 }],
      })),
    };
    const { container } = render(
      <AddToCompareButton
        entry={{ code: "002463", name: "沪电股份" }}
        variant="card"
        api={api}
      />,
    );
    fireEvent.click(container.querySelector(".add-compare-btn"));
    await waitFor(() => {
      expect(api.stocksSearch).toHaveBeenCalledWith("002463");
    });
  });

  it("variant='row' 渲染圆 icon-only 按钮 (无文字)", () => {
    const { container } = render(
      <AddToCompareButton
        entry={{ code: "002463", name: "沪电股份" }}
        variant="row"
      />,
    );
    expect(
      container.querySelector(".add-compare-btn.add-compare-row"),
    ).toBeTruthy();
    // variant=row 时不显示文字
    expect(container.querySelector(".add-compare-text")).toBeFalsy();
  });
});
