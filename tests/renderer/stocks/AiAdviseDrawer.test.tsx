// @vitest-environment happy-dom
/**
 * tests/renderer/stocks/AiAdviseDrawer.test.jsx
 *
 * AI 推荐抽屉:
 *   - 6 个 chip, 默认第 1 个高亮
 *   - 点 chip 切 active
 *   - 点「生成推荐」调 requestAiAdvise(api, {intentChip, freeText})
 *   - state.status="loading" 时按钮禁用
 *   - state.status="error" 渲染错误原因文案
 *   - state.status="ready" + result → 渲染预览 + 应用按钮
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { AiAdviseDrawer } from "../../../src/renderer/stocks/AiAdviseDrawer.tsx";
import {
  aiAdvise,
  aiAdviseOpen,
  requestAiAdvise,
  applyAiAdvise,
  closeAdvise,
} from "../../../src/renderer/stocks/stockStore.ts";

vi.mock("../../../src/renderer/api.ts", () => ({ api: {} }));

beforeEach(() => {
  aiAdviseOpen.value = true;
  aiAdvise.value = { status: "idle", result: null, fromCache: false };
});
afterEach(() => {
  cleanup();
  aiAdviseOpen.value = false;
  aiAdvise.value = { status: "idle", result: null, fromCache: false };
});

describe("AiAdviseDrawer chip + 生成", () => {
  it("渲染 6 个 chip, 默认 '低估值修复' 高亮", () => {
    render(<AiAdviseDrawer />);
    const chips = document.body.querySelectorAll(".stock-advise-chip");
    expect(chips.length).toBe(6);
    const labels = Array.from(chips).map((c) => c.textContent.trim());
    expect(labels).toEqual([
      "低估值修复", "高分红防御", "超跌反弹", "成长动量", "行业龙头", "平衡型",
    ]);
    // 默认 active = 'low_value' → '低估值修复'
    expect(chips[0].classList.contains("active")).toBe(true);
  });

  it("点 chip → 切 active, 单选互斥", async () => {
    render(<AiAdviseDrawer />);
    const chips = document.body.querySelectorAll(".stock-advise-chip");
    // 切到第 3 个 '超跌反弹'
    fireEvent.click(chips[2]);
    await waitFor(() => {
      expect(chips[0].classList.contains("active")).toBe(false);
      expect(chips[2].classList.contains("active")).toBe(true);
    });
  });

  it("点 '生成推荐' → requestAiAdvise(api, {intentChip, freeText})", async () => {
    const api = {};
    const spy = vi.spyOn(
      await import("../../../src/renderer/stocks/stockStore.ts"),
      "requestAiAdvise",
    );
    render(<AiAdviseDrawer api={api} />);
    const btn = document.body.querySelector(".stock-advise-generate");
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledWith(api, expect.objectContaining({
      intentChip: expect.objectContaining({ id: "low_value" }),
    }));
  });

  it("自由文本输入 → 生成时一并传到 requestAiAdvise", async () => {
    const api = {};
    const spy = vi.spyOn(
      await import("../../../src/renderer/stocks/stockStore.ts"),
      "requestAiAdvise",
    );
    render(<AiAdviseDrawer api={api} />);
    const input = document.body.querySelector(".stock-advise-input");
    fireEvent.input(input, { target: { value: "银行地产" } });
    fireEvent.click(document.body.querySelector(".stock-advise-generate"));
    expect(spy).toHaveBeenCalledWith(api, expect.objectContaining({
      freeText: "银行地产",
    }));
  });
});

describe("AiAdviseDrawer 状态", () => {
  it("status=loading → 生成按钮禁用 + 显示 '生成中…'", () => {
    aiAdvise.value = { status: "loading", result: null };
    render(<AiAdviseDrawer />);
    const btn = document.body.querySelector(".stock-advise-generate");
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(btn.textContent).toMatch(/生成中/);
  });

  it("status=error → 渲染错误原因 (ERROR_REASON_TEXT)", () => {
    aiAdvise.value = {
      status: "error",
      result: null,
      reason: "api_key_missing",
    };
    render(<AiAdviseDrawer />);
    expect(
      document.body.querySelector(".stock-advise-error"),
    ).toBeTruthy();
    expect(document.body.textContent).toMatch(/AI Key 缺失/);
  });

  it("status=ready + result → 渲染预览 + 取消/应用按钮", () => {
    aiAdvise.value = {
      status: "ready",
      fromCache: false,
      result: {
        summary: "低估值高ROE大蓝筹",
        rationale: "当前市场估值低位 + 高ROE稳定",
        criteria: { peMax: 20, roeMin: 15 },
        sortConfig: { key: "roe", dir: "desc" },
      },
    };
    render(<AiAdviseDrawer />);
    expect(document.body.querySelector(".stock-advise-preview")).toBeTruthy();
    // ponytail: summary 渲染, rationale 不显示在 UI (spec §3.3 预览只露条件 + 总结)
    expect(document.body.textContent).toMatch(/低估值高ROE大蓝筹/);
    // 条件项 PE 20 / ROE 15 / 排序
    expect(document.body.textContent).toMatch(/PE\s*—\s*-\s*20/);
    expect(document.body.textContent).toMatch(/ROE ≥ 15%/);
    expect(document.body.textContent).toMatch(/排序.*ROE.*降序/);
    // 两个操作按钮
    const buttons = document.body.querySelectorAll(".stock-advise-actions button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("点 '应用' → applyAiAdvise (写 criteria/sort, 关闭 drawer)", async () => {
    const spy = vi.spyOn(
      await import("../../../src/renderer/stocks/stockStore.ts"),
      "applyAiAdvise",
    );
    aiAdvise.value = {
      status: "ready",
      fromCache: false,
      result: {
        summary: "x",
        rationale: "y",
        criteria: { peMax: 25 },
        sortConfig: { key: "pe", dir: "asc" },
      },
    };
    render(<AiAdviseDrawer />);
    const applyBtn = Array.from(
      document.body.querySelectorAll(".stock-advise-actions button"),
    ).find((b) => /应用/.test(b.textContent));
    fireEvent.click(applyBtn);
    expect(spy).toHaveBeenCalled();
  });
});
