import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const stateStorePath = require.resolve("../../src/main/state-store.ts");
const registryPath = require.resolve("../../src/ai/prompt-registry.js");
const registerPath =
  require.resolve("../../src/main/ipc/register-ai-prompts.ts");

const loadAiPrompts = vi.fn(() => ({}));
const saveAiPrompts = vi.fn();
const DEFAULT_PROMPTS = {
  ithome_summary: { system: "默认sys", rules: "默认rules" },
  worldcup_prematch: { system: "p", rules: "r" },
  worldcup_postmatch: { system: "p2", rules: "r2" },
};
const PROMPT_KEYS = [
  "ithome_summary",
  "worldcup_prematch",
  "worldcup_postmatch",
];

function stubModules() {
  vi.resetModules();
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: { loadAiPrompts, saveAiPrompts },
  };
  require.cache[registryPath] = {
    id: registryPath,
    filename: registryPath,
    loaded: true,
    exports: {
      DEFAULT_PROMPTS,
      PROMPT_KEYS,
      resolvePrompt: () => DEFAULT_PROMPTS.ithome_summary,
    },
  };
}

beforeEach(() => {
  loadAiPrompts.mockReturnValue({});
  saveAiPrompts.mockReset();
  stubModules();
});

afterEach(() => {
  delete require.cache[stateStorePath];
  delete require.cache[registryPath];
  delete require.cache[registerPath];
});

describe("register-ai-prompts IPC (A7)", () => {
  function getHandlers() {
    const handlers = {};
    const safeHandle = vi.fn((ch, fn) => {
      handlers[ch] = fn;
    });
    const sendToRenderer = vi.fn();
    const { registerAiPromptsHandlers } = require(registerPath);
    registerAiPromptsHandlers({ safeHandle, sendToRenderer });
    return { handlers, sendToRenderer };
  }

  it("注册 ai-prompts:load + ai-prompts:save", () => {
    const { handlers } = getHandlers();
    expect(typeof handlers["ai-prompts:load"]).toBe("function");
    expect(typeof handlers["ai-prompts:save"]).toBe("function");
  });

  it("load 合并默认+用户, 标记 isDefault", () => {
    loadAiPrompts.mockReturnValue({});
    const { handlers } = getHandlers();
    const r = handlers["ai-prompts:load"]();
    expect(r.ithome_summary.system).toBe("默认sys");
    expect(r.ithome_summary.isDefault).toBe(true);
  });

  it("load 用户配置覆盖默认, isDefault=false", () => {
    loadAiPrompts.mockReturnValue({
      ithome_summary: { system: "自定义", rules: "r" },
    });
    const { handlers } = getHandlers();
    const r = handlers["ai-prompts:load"]();
    expect(r.ithome_summary.system).toBe("自定义");
    expect(r.ithome_summary.isDefault).toBe(false);
  });

  it("save 调 stateStore.saveAiPrompts + broadcast", () => {
    const { handlers, sendToRenderer } = getHandlers();
    const r = handlers["ai-prompts:save"](
      {},
      { ithome_summary: { system: "x", rules: "y" } },
    );
    expect(saveAiPrompts).toHaveBeenCalledWith({
      ithome_summary: { system: "x", rules: "y" },
    });
    expect(sendToRenderer).toHaveBeenCalledWith("ai-prompts-updated", {});
    expect(r.ok).toBe(true);
  });

  it("save 无效参数 → invalid_args", () => {
    const { handlers } = getHandlers();
    const r = handlers["ai-prompts:save"]({}, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });

  it("reset 删除用户配置 key", () => {
    loadAiPrompts.mockReturnValue({
      ithome_summary: { system: "自定义", rules: "r" },
    });
    const { handlers, sendToRenderer } = getHandlers();
    const r = handlers["ai-prompts:reset"]({}, "ithome_summary");
    expect(r.ok).toBe(true);
    expect(saveAiPrompts).toHaveBeenCalledWith({});
    expect(sendToRenderer).toHaveBeenCalledWith("ai-prompts-updated", {});
  });
});
