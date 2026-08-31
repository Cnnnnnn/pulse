import { describe, expect, it } from "vitest";
import {
  sortThreadsForDisplay,
  type ChatThread,
} from "../../../src/renderer/assistant/chat-threads";
import {
  messagesForShare,
  messagesToMarkdown,
} from "../../../src/renderer/assistant/chat-export";

describe("chat-threads tier18", () => {
  it("sortThreadsForDisplay puts pinned threads first", () => {
    const threads: ChatThread[] = [
      { id: "a", title: "a", updatedAt: 100, messages: [] },
      { id: "b", title: "b", updatedAt: 50, messages: [], pinned: true },
      { id: "c", title: "c", updatedAt: 200, messages: [] },
    ];
    expect(sortThreadsForDisplay(threads).map((t) => t.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

describe("chat-export tier18", () => {
  it("messagesForShare can exclude system messages", () => {
    const msgs = [
      { role: "user" as const, content: "hi" },
      { role: "system" as const, content: "alert" },
      { role: "assistant" as const, content: "ok" },
    ];
    expect(messagesForShare(msgs, { excludeSystem: true })).toHaveLength(2);
    expect(messagesToMarkdown(msgs, { excludeSystem: true })).not.toContain(
      "## 系统",
    );
  });
});
