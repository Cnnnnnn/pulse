import { describe, expect, it, beforeEach } from "vitest";
import {
  findAdjacentUserMessageIndex,
  findFirstUserMessageIndex,
  findLastUserMessageIndex,
  resolveAdjacentUserMessageIndex,
  getVisibleMessageIndices,
} from "../../../src/renderer/assistant/chat-message-index";
import {
  messageMatchesRoleFilter,
  countMessagesForRoleFilter,
} from "../../../src/renderer/assistant/chat-message-filter";
import {
  loadMessageRoleFilterDraft,
  saveMessageRoleFilterDraft,
} from "../../../src/renderer/assistant/chat-message-filter-draft";
import { messagesToMarkdown } from "../../../src/renderer/assistant/chat-export";
import type { AiChatMessage } from "../../../src/shared/ipc-contracts";

describe("chat-message-index tier29", () => {
  const msgs: AiChatMessage[] = [
    { role: "system", content: "s" },
    { role: "user", content: "q1" },
    { role: "assistant", content: "a1" },
    { role: "user", content: "q2" },
    { role: "assistant", content: "a2", feedback: "down" },
    { role: "user", content: "q3" },
  ];

  it("findAdjacentUserMessageIndex walks user messages", () => {
    expect(findAdjacentUserMessageIndex(msgs, 3, "prev")).toBe(1);
    expect(findAdjacentUserMessageIndex(msgs, 1, "next")).toBe(3);
    expect(findAdjacentUserMessageIndex(msgs, 5, "prev")).toBe(3);
    expect(findAdjacentUserMessageIndex(msgs, 1, "prev")).toBe(-1);
  });

  it("resolveAdjacentUserMessageIndex wraps when no adjacent", () => {
    expect(resolveAdjacentUserMessageIndex(msgs, 1, "prev")).toBe(5);
    expect(resolveAdjacentUserMessageIndex(msgs, 5, "next")).toBe(1);
  });

  it("findFirst/Last user unchanged", () => {
    expect(findFirstUserMessageIndex(msgs)).toBe(1);
    expect(findLastUserMessageIndex(msgs)).toBe(5);
  });
});

describe("chat-message-filter feedback tier29", () => {
  const msgs: AiChatMessage[] = [
    { role: "assistant", content: "a", feedback: "up" },
    { role: "assistant", content: "b", feedback: "down" },
    { role: "assistant", content: "c" },
  ];

  it("messageMatchesRoleFilter supports feedback filters", () => {
    expect(messageMatchesRoleFilter(msgs[0], "feedback_up")).toBe(true);
    expect(messageMatchesRoleFilter(msgs[1], "feedback_down")).toBe(true);
    expect(messageMatchesRoleFilter(msgs[2], "feedback_up")).toBe(false);
  });

  it("getVisibleMessageIndices combines feedback filter with search", () => {
    const indices = getVisibleMessageIndices(
      [
        { role: "assistant", content: "基金解读" },
        { role: "assistant", content: "股票建议", feedback: "down" },
      ],
      { roleFilter: "feedback_down", searchQuery: "股票" },
    );
    expect(indices).toEqual([1]);
  });

  it("countMessagesForRoleFilter counts feedback", () => {
    expect(countMessagesForRoleFilter(msgs, "feedback_down")).toBe(1);
  });
});

describe("chat-message-filter-draft feedback tier29", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists feedback filter per thread", () => {
    saveMessageRoleFilterDraft("t1", "feedback_down");
    expect(loadMessageRoleFilterDraft("t1")).toBe("feedback_down");
  });
});

describe("chat-export feedback tier29", () => {
  it("messagesToMarkdown annotates feedback on heading", () => {
    const md = messagesToMarkdown([
      { role: "assistant", content: "ok", feedback: "down" },
    ]);
    expect(md).toContain("👎");
    expect(md).toContain("## 助手");
  });

  it("messagesToMarkdown subset title can include excerpt suffix via opts", () => {
    const md = messagesToMarkdown([{ role: "user", content: "hi" }], {
      title: "测试（节选）",
      statsLine: "共 1 条消息 · 1 轮对话",
    });
    expect(md).toContain("# 测试（节选）");
    expect(md).toContain("共 1 条消息");
  });
});
