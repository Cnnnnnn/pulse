import { describe, expect, it } from "vitest";
import {
  summarizeOmittedTurns,
  trimMessagesForLlm,
  buildOmittedHistoryNoteFromSummary,
  computeTrimStart,
  estimateTokens,
  MAX_LLM_MESSAGES,
  MAX_LLM_TOKENS,
} from "../../src/ai/chat-truncate";

describe("chat-truncate", () => {
  it("passes through short histories", () => {
    const msgs = [{ role: "user", content: "hi" }];
    expect(trimMessagesForLlm(msgs)).toEqual(msgs);
  });

  it("summarizeOmittedTurns extracts user and assistant lines", () => {
    const s = summarizeOmittedTurns([
      { role: "user", content: "打开电影页" },
      { role: "assistant", content: "好的，我来帮你。\n已查询。" },
    ]);
    expect(s).toContain("用户：打开电影页");
    expect(s).toContain("助手：");
  });

  it("truncates long histories with extractive summary note", () => {
    const msgs = Array.from({ length: MAX_LLM_MESSAGES + 5 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: i === 0 ? "打开应用列表" : `m${i}`,
    }));
    const out = trimMessagesForLlm(msgs);
    expect(out.length).toBeLessThan(msgs.length);
    expect(out[0].content).toContain("摘要");
    expect(out[0].content).toContain("打开应用列表");
    expect(out[out.length - 1].content).toBe(`m${msgs.length - 1}`);
  });

  it("buildOmittedHistoryNoteFromSummary supports llm label", () => {
    const note = buildOmittedHistoryNoteFromSummary(6, "· 要点", "llm");
    expect(note.content).toContain("LLM 压缩");
    expect(note.content).toContain("要点");
  });

  it("estimateTokens 估算 CJK 与 ASCII", () => {
    expect(estimateTokens("你好")).toBe(2);
    expect(estimateTokens("hello")).toBe(2); // 5 字符 × 0.25 → ceil 1.25 = 2
    expect(estimateTokens("")).toBe(0);
  });

  it("computeTrimStart 在 token 超但条数未超时也裁剪", () => {
    const long = "字".repeat(MAX_LLM_TOKENS + 100);
    const msgs = [
      { role: "user", content: long },
      { role: "assistant", content: long },
      { role: "user", content: "倒数第二" },
      { role: "assistant", content: "最后一条" },
    ];
    expect(msgs.length).toBeLessThanOrEqual(18); // 条数维度未超
    expect(computeTrimStart(msgs)).toBeGreaterThan(0);
    const out = trimMessagesForLlm(msgs);
    expect(out.length).toBeLessThan(msgs.length);
    expect(out[out.length - 1].content).toBe("最后一条");
    expect(out[0].content).toContain("摘要");
  });
});
