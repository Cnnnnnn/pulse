// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";

// vi.hoisted: 创建的 signal/mock 在 hoist 阶段就存在, mock factory 可安全引用
const store = vi.hoisted(() => {
  const { signal } = require("@preact/signals");
  return {
    aiPrompts: signal(null),
    loadAiPrompts: vi.fn(async () => {}),
    saveAiPrompts: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("../../src/renderer/store/prompt-store.js", () => ({
  aiPrompts: store.aiPrompts,
  loadAiPrompts: store.loadAiPrompts,
  saveAiPrompts: store.saveAiPrompts,
  resetAiPrompt: vi.fn(async () => ({ ok: true })),
  promptLabel: (k) => k,
}));

vi.mock("../../src/renderer/store.js", () => ({
  showToast: vi.fn(),
}));

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    feedbackExport: vi.fn(async () => ({ ok: true, samples: [] })),
    tokenBudgetGet: vi.fn(async () => ({ ok: true, config: { dailyLimit: 0, mode: "warn" }, todaySpend: 0 })),
    tokenBudgetSet: vi.fn(async () => ({ ok: true })),
  },
}));

import { PromptSettings } from "../../src/renderer/components/PromptSettings.jsx";

const SAMPLE = {
  ithome_summary: { system: "默认sys", rules: "默认rules", isDefault: true },
  worldcup_prematch: { system: "p", rules: "r", isDefault: true },
  worldcup_postmatch: { system: "p2", rules: "r2", isDefault: true },
};

beforeEach(() => {
  store.aiPrompts.value = SAMPLE;
  store.loadAiPrompts.mockClear();
  store.saveAiPrompts.mockClear();
  document.body.innerHTML = "";
});

describe("PromptSettings (A7)", () => {
  it("渲染 3 个 prompt section", () => {
    render(<PromptSettings />);
    // P16: 改用 settings-card 段落, 包含 1 个「Prompt 模板说明」+ 1 个「Token 预算」+ 3 个 prompt 段 = 5 张卡片
    const cards = document.body.querySelectorAll(".settings-card");
    // 反馈导出 + token 预算 + 3 prompt 卡片 = 5 卡片
    expect(cards.length).toBe(5);
  });

  it("isDefault=true 显示 3 个「默认」标记", () => {
    render(<PromptSettings />);
    // P16: 「默认」badge 改用 settings-ai-badge--ready, 文本 "默认"
    expect(document.body.querySelectorAll(".settings-ai-badge--ready")).toHaveLength(3);
  });

  it("编辑 system textarea 触发保存 (debounce 500ms)", async () => {
    render(<PromptSettings />);
    // P16: textarea 复用 .settings-input, 3 prompts × 3 = 9 个 textarea
    const textareas = Array.from(document.body.querySelectorAll(".settings-input")).filter(
      (el) => el.tagName === "TEXTAREA"
    );
    expect(textareas).toHaveLength(9);
    fireEvent.input(textareas[0], { target: { value: "新角色" } });
    await new Promise((r) => setTimeout(r, 600));
    expect(store.saveAiPrompts).toHaveBeenCalled();
  });

  // A7 v3: daily_digest_summary key 加入后 PromptSettings 自动渲染
  it("daily_digest_summary prompt 出现 → 多渲染一个 prompt 段 + 9 个 textarea", () => {
    store.aiPrompts.value = {
      ...SAMPLE,
      daily_digest_summary: { system: "编辑", rules: "1. 简洁", isDefault: false },
    };
    render(<PromptSettings />);
    // 1 反馈导出 + 1 token 预算 + 4 prompt 段 = 6 卡片
    const textareas = Array.from(document.body.querySelectorAll(".settings-input")).filter(
      (el) => el.tagName === "TEXTAREA"
    );
    expect(textareas).toHaveLength(12); // 4 prompts × 3
  });
});
