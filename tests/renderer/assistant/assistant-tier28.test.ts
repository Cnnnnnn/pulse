import { describe, expect, it, beforeEach } from "vitest";
import {
  findFirstUserMessageIndex,
  findLastUserMessageIndex,
  getVisibleMessageIndices,
  hasActiveMessageViewFilter,
} from "../../../src/renderer/assistant/chat-message-index";
import {
  loadExportIncludeTimestamps,
  saveExportIncludeTimestamps,
} from "../../../src/renderer/assistant/chat-export-prefs";
import { messagesToMarkdown } from "../../../src/renderer/assistant/chat-export";
import type { AiChatMessage } from "../../../src/shared/ipc-contracts";

describe("chat-message-index tier28", () => {
  const msgs: AiChatMessage[] = [
    { role: "system", content: "s" },
    { role: "user", content: "first question" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "second question" },
  ];

  it("findFirstUserMessageIndex finds first user", () => {
    expect(findFirstUserMessageIndex(msgs)).toBe(1);
    expect(findLastUserMessageIndex(msgs)).toBe(3);
  });

  it("getVisibleMessageIndices applies role and search", () => {
    expect(
      getVisibleMessageIndices(msgs, {
        roleFilter: "assistant",
        searchQuery: "",
      }),
    ).toEqual([2]);
    expect(
      getVisibleMessageIndices(msgs, {
        roleFilter: "all",
        searchQuery: "question",
      }),
    ).toEqual([1, 3]);
    expect(
      getVisibleMessageIndices(msgs, {
        roleFilter: "user",
        searchQuery: "second",
      }),
    ).toEqual([3]);
  });

  it("hasActiveMessageViewFilter detects active filters", () => {
    expect(
      hasActiveMessageViewFilter({ roleFilter: "all", searchQuery: "" }),
    ).toBe(false);
    expect(
      hasActiveMessageViewFilter({ roleFilter: "user", searchQuery: "" }),
    ).toBe(true);
    expect(
      hasActiveMessageViewFilter({ roleFilter: "all", searchQuery: "x" }),
    ).toBe(true);
  });
});

describe("chat-export timestamps tier28", () => {
  it("messagesToMarkdown includes timestamp in heading", () => {
    const md = messagesToMarkdown(
      [{ role: "user", content: "hi", ts: new Date("2026-08-28T14:30:00").getTime() }],
      { includeTimestamps: true },
    );
    expect(md).toMatch(/## 你 · \d{1,2}:\d{2}/);
  });
});

describe("chat-export-prefs timestamps tier28", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists include timestamps preference", () => {
    expect(loadExportIncludeTimestamps()).toBe(false);
    saveExportIncludeTimestamps(true);
    expect(loadExportIncludeTimestamps()).toBe(true);
  });
});
