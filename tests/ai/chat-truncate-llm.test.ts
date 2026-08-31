import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  LLM_SUMMARY_MIN_OMITTED,
  summarizeOmittedTurnsWithLlm,
  trimMessagesForLlmAsync,
} from "../../src/ai/chat-truncate-llm";
import { MAX_LLM_MESSAGES } from "../../src/ai/chat-truncate";

vi.mock("../../src/ai/shared-llm", () => ({
  resolveSharedAiConfig: vi.fn(() => ({
    ok: true,
    providerId: "openai",
    model: "gpt-4o-mini",
  })),
  chatCompletion: vi.fn(),
}));

vi.mock("../../src/ai/assistant-model-route", () => ({
  pickFastModel: vi.fn(() => "gpt-4o-mini"),
}));

vi.mock("../../src/main/state-store.js", () => ({
  loadAISessionsConfig: vi.fn(() => ({})),
}));

import { chatCompletion } from "../../src/ai/shared-llm";
import { loadAISessionsConfig } from "../../src/main/state-store.js";

describe("chat-truncate-llm", () => {
  beforeEach(() => {
    vi.mocked(chatCompletion).mockReset();
    vi.mocked(loadAISessionsConfig).mockReturnValue({});
  });

  it("summarizeOmittedTurnsWithLlm returns null for short omitted", async () => {
    const out = await summarizeOmittedTurnsWithLlm([
      { role: "user", content: "hi" },
    ]);
    expect(out).toBeNull();
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("summarizeOmittedTurnsWithLlm uses LLM when enough turns", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({
      ok: true,
      text: "· 用户想打开应用列表\n· 已切换 versions",
    });
    const omitted = Array.from({ length: LLM_SUMMARY_MIN_OMITTED }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const out = await summarizeOmittedTurnsWithLlm(omitted);
    expect(out).toContain("应用列表");
    expect(chatCompletion).toHaveBeenCalledOnce();
  });

  it("trimMessagesForLlmAsync falls back to extractive when LLM fails", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({ ok: false, reason: "llm_failed" });
    const msgs = Array.from({ length: MAX_LLM_MESSAGES + 3 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: i === 0 ? "打开电影" : `m${i}`,
    }));
    const out = await trimMessagesForLlmAsync(msgs, { useLlmSummary: true });
    expect(out.length).toBeLessThan(msgs.length);
    expect(out[0].content).toContain("摘要");
    expect(out[0].content).toContain("打开电影");
  });

  it("trimMessagesForLlmAsync marks LLM summary in note", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({
      ok: true,
      text: "· 要点一",
    });
    const msgs = Array.from({ length: MAX_LLM_MESSAGES + 3 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `long history ${i}`,
    }));
    const out = await trimMessagesForLlmAsync(msgs);
    expect(out[0].content).toContain("LLM 压缩");
    expect(out[0].content).toContain("要点一");
  });

  it("trimMessagesForLlmAsync skips LLM when config disabled", async () => {
    vi.mocked(loadAISessionsConfig).mockReturnValue({
      assistantLlmHistorySummary: false,
    });
    const msgs = Array.from({ length: MAX_LLM_MESSAGES + 3 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: i === 0 ? "打开电影" : `m${i}`,
    }));
    const out = await trimMessagesForLlmAsync(msgs);
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(out[0].content).not.toContain("LLM 压缩");
    expect(out[0].content).toContain("摘要");
  });
});
