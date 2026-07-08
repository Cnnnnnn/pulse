// @vitest-environment happy-dom
/**
 * tests/renderer/stocks/StrategyBar.test.jsx
 *
 * StrategyBar — 4 个预设策略 chip + 自定义标记.
 *   - 点 chip → applyStrategy(id): 写 criteria + activeStrategy
 *   - 改条件 (setCriteria) → activeStrategy 切 "custom" (所有 chip 取消高亮)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { StrategyBar } from "../../../src/renderer/stocks/StrategyBar.jsx";
import {
  activeStrategy,
  criteria,
  applyStrategy,
  setCriteria,
} from "../../../src/renderer/stocks/stockStore.js";

vi.mock("../../../src/renderer/api.js", () => ({ api: {} }));

beforeEach(() => {
  activeStrategy.value = "value_roe";
  criteria.value = { peMin: 0, peMax: 20, roeMin: 15, marketCapTier: "large" };
});
afterEach(() => {
  cleanup();
  activeStrategy.value = "value_roe";
});

describe("StrategyBar 策略 chip", () => {
  it("渲染 4 个策略 chip + 1 个 自定义标记", () => {
    const { container } = render(<StrategyBar />);
    const chips = container.querySelectorAll(".stock-strategy-chip");
    // 4 个 button + 1 个自定义 (span)
    expect(chips.length).toBe(5);
    const labels = Array.from(chips).map((c) => c.textContent.trim());
    expect(labels).toContain("低估值高ROE");
    expect(labels).toContain("蓝筹白马");
    expect(labels).toContain("高股息");
    expect(labels).toContain("成长动量");
    expect(labels).toContain("自定义");
  });

  it("当前 activeStrategy 对应 chip 加 .active", () => {
    activeStrategy.value = "high_div";
    const { container } = render(<StrategyBar />);
    const chips = container.querySelectorAll(".stock-strategy-chip");
    const active = Array.from(chips).filter((c) =>
      c.classList.contains("active"),
    );
    expect(active.length).toBe(1);
    expect(active[0].textContent.trim()).toBe("高股息");
  });

  it("点 chip → applyStrategy(id) 写 criteria + activeStrategy", () => {
    const { container } = render(<StrategyBar />);
    const chips = container.querySelectorAll(".stock-strategy-chip");
    // 第 1 个是 低估值高ROE (默认 active), 找 蓝筹白马
    const blueChip = Array.from(chips).find(
      (c) => c.textContent.trim() === "蓝筹白马",
    );
    fireEvent.click(blueChip);
    expect(activeStrategy.value).toBe("blue_chip");
    expect(criteria.value.peMax).toBe(30);
    expect(criteria.value.roeMin).toBe(15);
    expect(criteria.value.marketCapTier).toBe("large");
  });

  it("改条件 (setCriteria) → activeStrategy 切 'custom', 自定义标记高亮", async () => {
    const { container } = render(<StrategyBar />);
    setCriteria({ peMin: 5 });
    // ponytail: Preact Signals 异步 batch, await waitFor 触发 re-render 后再断言
    await waitFor(() => {
      const customChip = Array.from(
        container.querySelectorAll(".stock-strategy-chip"),
      ).find((c) => c.textContent.trim() === "自定义");
      expect(customChip.classList.contains("active")).toBe(true);
    });
    // 4 个 button 都不带 active
    const buttons = container.querySelectorAll(
      ".stock-strategy-chip:not(.stock-strategy-custom)",
    );
    buttons.forEach((b) => expect(b.classList.contains("active")).toBe(false));
  });
});
