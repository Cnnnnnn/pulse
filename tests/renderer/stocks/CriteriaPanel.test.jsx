// @vitest-environment happy-dom
/**
 * tests/renderer/stocks/CriteriaPanel.test.jsx
 *
 * 条件面板:
 *   - 默认露 PE/ROE/市值, 高级折叠 PB/股息/换手/动量/营收同比/净利同比/行业
 *   - 改 RangeInput/MinInput/select → setCriteria 触发
 *   - 改任何条件 → activeStrategy 切 "custom"
 *   - 行业 chip: 默认空数组 = 全部; 点 chip 切到只选
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { CriteriaPanel } from "../../../src/renderer/stocks/CriteriaPanel.jsx";
import {
  criteria,
  advancedOpen,
  activeStrategy,
  results,
} from "../../../src/renderer/stocks/stockStore.js";
import { DEFAULT_SCREENER_CRITERIA } from "../../../src/stocks/stock-constants.js";

vi.mock("../../../src/renderer/api.js", () => ({ api: {} }));

beforeEach(() => {
  criteria.value = { ...DEFAULT_SCREENER_CRITERIA };
  advancedOpen.value = false;
  activeStrategy.value = "value_roe";
  results.value = [];
});
afterEach(() => {
  cleanup();
});

describe("CriteriaPanel 默认区", () => {
  it("默认显示 PE 范围 / ROE 下限 / 市值 select / 高级按钮", () => {
    const { container } = render(<CriteriaPanel />);
    // PE 范围: 2 个 input (min/max)
    const fields = container.querySelectorAll(".stock-criteria-field");
    // 4 个: PE, ROE, 市值, [高级按钮占 1 个 .stock-criteria-advanced-toggle 不是 field]
    expect(fields.length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).toMatch(/PE/);
    expect(container.textContent).toMatch(/ROE/);
    expect(container.textContent).toMatch(/市值/);
    // 高级按钮存在
    expect(
      container.querySelector(".stock-criteria-advanced-toggle"),
    ).toBeTruthy();
  });

  it("改 PE min input → setCriteria 写 peMin, activeStrategy 切 custom", async () => {
    const { container } = render(<CriteriaPanel />);
    // 找第一个 number input (PE min)
    const inputs = container.querySelectorAll("input.stock-criteria-input");
    // PE 占 2 个 input (min/max), ROE 占 1 (min). PE min 是第 1 个.
    const peMinInput = inputs[0];
    fireEvent.input(peMinInput, { target: { value: "5" } });
    await waitFor(() => {
      expect(criteria.value.peMin).toBe(5);
      expect(activeStrategy.value).toBe("custom");
    });
  });

  it("改 ROE min input → setCriteria 写 roeMin", async () => {
    const { container } = render(<CriteriaPanel />);
    // ROE 是第 3 个 number input (PE min/max + ROE min)
    const inputs = container.querySelectorAll("input.stock-criteria-input");
    const roeInput = inputs[2];
    fireEvent.input(roeInput, { target: { value: "20" } });
    await waitFor(() => {
      expect(criteria.value.roeMin).toBe(20);
    });
  });

  it("改 市值 select → setCriteria 写 marketCapTier", async () => {
    const { container } = render(<CriteriaPanel />);
    const sel = container.querySelector("select.stock-criteria-select");
    fireEvent.change(sel, { target: { value: "mid" } });
    await waitFor(() => {
      expect(criteria.value.marketCapTier).toBe("mid");
    });
  });
});

describe("CriteriaPanel 高级折叠", () => {
  it("默认 adv=false, 不渲染高级 row", () => {
    advancedOpen.value = false;
    const { container } = render(<CriteriaPanel />);
    // 高级 row 包含 PB / 股息 / 换手 / 近 5 日 至少 4 个 .stock-criteria-field
    // 默认 3 个 (PE/ROE/市值)
    const fields = container.querySelectorAll(".stock-criteria-field");
    expect(fields.length).toBe(3);
    expect(container.textContent).not.toMatch(/股息/);
  });

  it("toggleAdvanced 后, adv=true, 渲染高级 row (PB/股息/换手/近5日/营收同比/净利同比)", async () => {
    advancedOpen.value = false;
    const { container } = render(<CriteriaPanel />);
    fireEvent.click(
      container.querySelector(".stock-criteria-advanced-toggle"),
    );
    await waitFor(() => {
      expect(advancedOpen.value).toBe(true);
    });
    expect(container.textContent).toMatch(/PB/);
    expect(container.textContent).toMatch(/股息/);
    expect(container.textContent).toMatch(/换手/);
    expect(container.textContent).toMatch(/近5日/);
    expect(container.textContent).toMatch(/营收同比/);
    expect(container.textContent).toMatch(/净利同比/);
  });
});

describe("CriteriaPanel 行业 chip", () => {
  beforeEach(() => {
    // 给 results 一些 industry 数据, 让 IndustryChips 有内容
    results.value = [
      { code: "1", name: "a", industry: "电池" },
      { code: "2", name: "b", industry: "白酒" },
      { code: "3", name: "c", industry: "PCB" },
    ];
  });

  it("results 已有 industry → 高级展开后渲染 chip 列表", async () => {
    advancedOpen.value = true;
    const { container } = render(<CriteriaPanel />);
    await waitFor(() => {
      const chips = container.querySelectorAll(".stock-criteria-industry-chip");
      expect(chips.length).toBe(3);
    });
    // 中文拼音排序: 白酒 / 电池 / PCB (zh-Hans-CN localeCompare 实际顺序)
    const labels = Array.from(
      container.querySelectorAll(".stock-criteria-industry-chip"),
    ).map((c) => c.textContent.trim());
    expect(labels).toEqual(["白酒", "电池", "PCB"]);
  });

  it("行业 chip 全部不选 = '全部 N'", async () => {
    advancedOpen.value = true;
    const { container } = render(<CriteriaPanel />);
    await waitFor(() => {
      expect(
        container.querySelector(".stock-criteria-industries-label").textContent,
      ).toMatch(/全部 3/);
    });
  });

  it("点 chip → 切到只选 (全选状态 → 只选这一项)", async () => {
    advancedOpen.value = true;
    const { container } = render(<CriteriaPanel />);
    const chip = Array.from(
      container.querySelectorAll(".stock-criteria-industry-chip"),
    ).find((c) => c.textContent.trim() === "白酒");
    fireEvent.click(chip);
    await waitFor(() => {
      expect(criteria.value.industries).toEqual(["白酒"]);
    });
  });

  it("results 为空时, 行业区显示占位 '筛选后可见'", async () => {
    results.value = [];
    advancedOpen.value = true;
    const { container } = render(<CriteriaPanel />);
    await waitFor(() => {
      expect(
        container.querySelector(".stock-criteria-industries-empty"),
      ).toBeTruthy();
      expect(container.textContent).toMatch(/筛选后可见/);
    });
  });
});
