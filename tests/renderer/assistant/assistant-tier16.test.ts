import { describe, expect, it } from "vitest";
import {
  matchAssistantCommands,
  parseAssistantAskText,
} from "../../../src/renderer/assistant/chat-command-palette";
import { findLastUserMessageIndex } from "../../../src/renderer/assistant/assistant-store";
import type { AiChatMessage } from "../../../src/shared/ipc-contracts";

describe("chat-command-palette tier16", () => {
  it("parseAssistantAskText strips ask prefix", () => {
    expect(parseAssistantAskText("问：有哪些更新？")).toBe("有哪些更新？");
    expect(parseAssistantAskText("ai: hello")).toBe("hello");
  });

  it("matchAssistantCommands returns ask action", () => {
    const hits = matchAssistantCommands("问：基金盈亏怎样");
    expect(hits.some((h) => h.id.startsWith("assistant-ask:"))).toBe(true);
    expect(hits.some((h) => h.id === "assistant-open")).toBe(true);
  });
});

describe("assistant-store tier16", () => {
  it("findLastUserMessageIndex finds last user", () => {
    const msgs: AiChatMessage[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ];
    expect(findLastUserMessageIndex(msgs)).toBe(2);
  });
});
