// @vitest-environment happy-dom
/**
 * P71 Task 6: PromptSettings token 预算输入 UI.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// mock prompt-store: 让 aiPrompts.value 有值, loadAiPrompts 即时 resolve
vi.mock("../../src/renderer/store/prompt-store.js", () => ({
  aiPrompts: { value: {} },
  loadAiPrompts: vi.fn(async () => {}),
  saveAiPrompts: vi.fn(async () => ({ ok: true })),
  resetAiPrompt: vi.fn(async () => ({ ok: true })),
  promptLabel: (k) => k,
}));

import { render, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { PromptSettings } from "../../src/renderer/components/PromptSettings.jsx";
import { api } from "../../src/renderer/api.js";

describe("PromptSettings token 预算", () => {
  beforeEach(() => {
    cleanup();
    // loadAiPrompts (prompt-store) 让其真实跑; mock token budget + feedbackExport (合并后组件两者都调)
    vi.spyOn(api, "tokenBudgetGet").mockResolvedValue({
      ok: true,
      config: { dailyLimit: 5000, mode: "warn" },
      todaySpend: 300,
    });
    vi.spyOn(api, "tokenBudgetSet").mockResolvedValue({ ok: true });
    vi.spyOn(api, "feedbackExport").mockResolvedValue({ ok: true, samples: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("加载时显示当日用量 + 当前预算 + 模式", async () => {
    const { container } = render(<PromptSettings />);
    await waitFor(() => {
      expect(container.textContent).toContain("今日已用 300");
    });
    // P16: token 预算段的 input 改用 .settings-input, 第一个是 number (limit), 第二个是 select (mode)
    const inputs = container.querySelectorAll(".settings-input");
    const limitInput = Array.from(inputs).find((el) => el.type === "number");
    const modeSelect = Array.from(inputs).find((el) => el.tagName === "SELECT");
    expect(limitInput.value).toBe("5000");
    expect(modeSelect.value).toBe("warn");
  });

  it("改预算限额 → 调用 tokenBudgetSet", async () => {
    const { container } = render(<PromptSettings />);
    await waitFor(() => {
      const inputs = container.querySelectorAll(".settings-input");
      expect(Array.from(inputs).some((el) => el.type === "number")).toBe(true);
    });
    const inputs = container.querySelectorAll(".settings-input");
    const input = Array.from(inputs).find((el) => el.type === "number");
    fireEvent.input(input, { target: { value: "9999" } });
    fireEvent.blur(input); // 失焦提交
    await waitFor(() => expect(api.tokenBudgetSet).toHaveBeenCalled());
    const arg = api.tokenBudgetSet.mock.calls[0][0];
    expect(arg.dailyLimit).toBe(9999);
    expect(arg.mode).toBe("warn");
  });

  it("切模式为 block → 调用 tokenBudgetSet", async () => {
    const { container } = render(<PromptSettings />);
    await waitFor(() => {
      const inputs = container.querySelectorAll(".settings-input");
      expect(Array.from(inputs).some((el) => el.tagName === "SELECT")).toBe(true);
    });
    const inputs = container.querySelectorAll(".settings-input");
    const select = Array.from(inputs).find((el) => el.tagName === "SELECT");
    fireEvent.change(select, { target: { value: "block" } });
    await waitFor(() => expect(api.tokenBudgetSet).toHaveBeenCalled());
    const arg = api.tokenBudgetSet.mock.calls[0][0];
    expect(arg.mode).toBe("block");
    expect(arg.dailyLimit).toBe(5000);
  });

  it("limit=0 显示为不限制", async () => {
    api.tokenBudgetGet.mockResolvedValue({
      ok: true,
      config: { dailyLimit: 0, mode: "warn" },
      todaySpend: 0,
    });
    const { container } = render(<PromptSettings />);
    await waitFor(() => {
      expect(container.textContent).toContain("不限制");
    });
  });
});
