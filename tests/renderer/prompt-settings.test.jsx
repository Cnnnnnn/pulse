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
    expect(document.body.querySelectorAll(".prompt-settings-item")).toHaveLength(3);
  });

  it("isDefault=true 显示 3 个「默认」标记", () => {
    render(<PromptSettings />);
    expect(document.body.querySelectorAll(".prompt-settings-default-tag")).toHaveLength(3);
  });

  it("编辑 system textarea 触发保存 (debounce 500ms)", async () => {
    render(<PromptSettings />);
    const textareas = document.body.querySelectorAll(".prompt-settings-textarea");
    expect(textareas).toHaveLength(9); // 3 prompts × (system + rules + fewShot)
    fireEvent.input(textareas[0], { target: { value: "新角色" } });
    await new Promise((r) => setTimeout(r, 600));
    expect(store.saveAiPrompts).toHaveBeenCalled();
  });

  // A7 v3: daily_digest_summary key 加入后 PromptSettings 自动渲染
  it("daily_digest_summary prompt 出现 → 多渲染一个 item + 9 个 textarea", () => {
    store.aiPrompts.value = {
      ...SAMPLE,
      daily_digest_summary: { system: "编辑", rules: "1. 简洁", isDefault: false },
    };
    render(<PromptSettings />);
    expect(document.body.querySelectorAll(".prompt-settings-item")).toHaveLength(4);
    expect(document.body.querySelectorAll(".prompt-settings-textarea")).toHaveLength(12);
  });
});
