import { describe, expect, it, beforeEach } from "vitest";
import {
  loadMessageRoleFilterDraft,
  saveMessageRoleFilterDraft,
} from "../../../src/renderer/assistant/chat-message-filter-draft";
import {
  appendQuoteToDraft,
  formatQuotedMessage,
} from "../../../src/renderer/assistant/chat-message-quote";
import { messagesToMarkdown } from "../../../src/renderer/assistant/chat-export";

describe("chat-message-filter-draft tier27", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists role filter per thread", () => {
    saveMessageRoleFilterDraft("t1", "assistant");
    expect(loadMessageRoleFilterDraft("t1")).toBe("assistant");
    expect(loadMessageRoleFilterDraft("t2")).toBe("all");
  });

  it("clears all filter on save", () => {
    saveMessageRoleFilterDraft("t1", "user");
    saveMessageRoleFilterDraft("t1", "all");
    expect(loadMessageRoleFilterDraft("t1")).toBe("all");
  });
});

describe("chat-message-quote tier27", () => {
  it("formatQuotedMessage prefixes lines", () => {
    expect(formatQuotedMessage("hello\nworld")).toBe("> hello\n> world");
  });

  it("appendQuoteToDraft joins existing draft", () => {
    expect(appendQuoteToDraft("draft", "> q")).toBe("draft\n\n> q\n\n");
    expect(appendQuoteToDraft("", "> q")).toBe("> q\n\n");
  });
});

describe("chat-export stats tier27", () => {
  it("messagesToMarkdown includes stats line", () => {
    const md = messagesToMarkdown(
      [{ role: "user", content: "hi" }],
      { statsLine: "共 1 条消息 · 1 轮对话" },
    );
    expect(md).toContain("> 共 1 条消息 · 1 轮对话");
  });
});
