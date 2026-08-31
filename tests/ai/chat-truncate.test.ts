import { describe, expect, it } from "vitest";
import {
  summarizeOmittedTurns,
  trimMessagesForLlm,
  buildOmittedHistoryNoteFromSummary,
  MAX_LLM_MESSAGES,
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
});
