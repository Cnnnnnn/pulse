import { describe, expect, it } from "vitest";
import {
  findMessageMatchIndices,
  messageMatchesQuery,
  normalizeMessageSearchQuery,
  wrapMatchPosition,
} from "../../../src/renderer/assistant/chat-message-search";
import type { AiChatMessage } from "../../../src/shared/ipc-contracts";

describe("chat-message-search tier23", () => {
  const msgs: AiChatMessage[] = [
    { role: "user", content: "基金盈亏怎样" },
    { role: "assistant", content: "你的基金今日上涨" },
    { role: "system", content: "系统提醒" },
    { role: "user", content: "再看看股票" },
  ];

  it("normalizeMessageSearchQuery trims and lowercases", () => {
    expect(normalizeMessageSearchQuery("  Hello ")).toBe("hello");
  });

  it("messageMatchesQuery matches content case-insensitively", () => {
    expect(messageMatchesQuery(msgs[0], "基金")).toBe(true);
    expect(messageMatchesQuery(msgs[1], "FUND")).toBe(false);
    expect(messageMatchesQuery(msgs[2], "提醒")).toBe(true);
  });

  it("findMessageMatchIndices returns all matching indices", () => {
    expect(findMessageMatchIndices(msgs, "基金")).toEqual([0, 1]);
    expect(findMessageMatchIndices(msgs, "股票")).toEqual([3]);
    expect(findMessageMatchIndices(msgs, "   ")).toEqual([]);
  });

  it("wrapMatchPosition wraps around", () => {
    expect(wrapMatchPosition(2, 3)).toBe(2);
    expect(wrapMatchPosition(3, 3)).toBe(0);
    expect(wrapMatchPosition(-1, 3)).toBe(2);
  });
});
