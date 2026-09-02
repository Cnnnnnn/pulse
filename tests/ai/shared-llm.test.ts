/**
 * tests/ai/shared-llm.test.js
 */

import { describe, it, expect } from "vitest";
import {
  SUPPORTED_PROVIDERS,
  chatCompletion,
  extractUsageTotalTokens,
} from "../../src/ai/shared-llm.ts";
import {
  DEFAULT_MODELS,
  resolveMaxOutputTokens,
  DEFAULT_MAX_OUTPUT_TOKENS,
} from "../../src/ai/default-models.ts";

describe("shared-llm", () => {
  it("导出支持的 provider 列表", () => {
    expect(SUPPORTED_PROVIDERS).toContain("minimax");
    expect(SUPPORTED_PROVIDERS).toContain("deepseek");
  });

  it("缺省模型表含 deepseek / minimax", () => {
    expect(DEFAULT_MODELS.deepseek).toBe("deepseek-chat");
    expect(DEFAULT_MODELS.minimax).toBe("MiniMax-M3");
  });

  it("空 messages 返回 empty_messages", async () => {
    const r = await chatCompletion([]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty_messages");
  });

  it("extractUsageTotalTokens 归一 openai/anthropic usage", () => {
    expect(extractUsageTotalTokens({ usage: { total_tokens: 42 } }, "openai")).toBe(42);
    expect(
      extractUsageTotalTokens(
        { usage: { input_tokens: 10, output_tokens: 32 } },
        "anthropic",
      ),
    ).toBe(42);
    expect(extractUsageTotalTokens({ usage: { total_tokens: 0 } }, "openai")).toBeNull();
    expect(extractUsageTotalTokens({}, "openai")).toBeNull();
    expect(extractUsageTotalTokens(null, "openai")).toBeNull();
  });

  it("resolveMaxOutputTokens 思考型加大, 其余默认", () => {
    expect(resolveMaxOutputTokens("MiniMax-M3")).toBe(16384);
    expect(resolveMaxOutputTokens("deepseek-reasoner")).toBe(16384);
    expect(resolveMaxOutputTokens("gpt-4o")).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(resolveMaxOutputTokens()).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(resolveMaxOutputTokens(undefined, 4096)).toBe(4096);
  });
});
