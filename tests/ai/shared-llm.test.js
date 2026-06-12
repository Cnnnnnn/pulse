/**
 * tests/ai/shared-llm.test.js
 */

import { describe, it, expect } from "vitest";
import {
  SUPPORTED_PROVIDERS,
  chatCompletion,
} from "../../src/ai/shared-llm.js";

describe("shared-llm", () => {
  it("导出支持的 provider 列表", () => {
    expect(SUPPORTED_PROVIDERS).toContain("minimax");
    expect(SUPPORTED_PROVIDERS).toContain("deepseek");
  });

  it("空 messages 返回 empty_messages", async () => {
    const r = await chatCompletion([]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty_messages");
  });
});
