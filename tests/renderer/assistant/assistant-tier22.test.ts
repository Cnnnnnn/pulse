import { describe, expect, it } from "vitest";
import {
  summarizeMessageFeedback,
  formatFeedbackSummary,
  countEmptyThreads,
} from "../../../src/renderer/assistant/chat-message-feedback";
import type { AiChatMessage } from "../../../src/shared/ipc-contracts";

describe("chat-message-feedback tier22", () => {
  it("summarizeMessageFeedback counts up and down", () => {
    const msgs: AiChatMessage[] = [
      { role: "assistant", content: "a", feedback: "up" },
      { role: "assistant", content: "b", feedback: "up" },
      { role: "assistant", content: "c", feedback: "down" },
      { role: "user", content: "q" },
    ];
    expect(summarizeMessageFeedback(msgs)).toEqual({ up: 2, down: 1 });
  });

  it("formatFeedbackSummary omits zero counts", () => {
    expect(formatFeedbackSummary({ up: 0, down: 0 })).toBe("");
    expect(formatFeedbackSummary({ up: 2, down: 0 })).toBe("赞 2");
    expect(formatFeedbackSummary({ up: 1, down: 3 })).toBe("赞 1 · 踩 3");
  });

  it("countEmptyThreads counts threads without messages", () => {
    const threads = [
      { messages: [] },
      { messages: [{ role: "user" as const, content: "hi" }] },
      { messages: [] },
    ];
    expect(countEmptyThreads(threads)).toBe(2);
  });
});
