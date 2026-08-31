import { describe, expect, it, beforeEach } from "vitest";
import {
  clearChatDraft,
  loadChatDraft,
  saveChatDraft,
} from "../../../src/renderer/assistant/chat-input-draft";
import { formatPageContextSnippet } from "../../../src/renderer/assistant/page-context";

describe("chat-input-draft tier19", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("save and load draft per thread", () => {
    saveChatDraft("t1", "hello");
    expect(loadChatDraft("t1")).toBe("hello");
    clearChatDraft("t1");
    expect(loadChatDraft("t1")).toBe("");
  });

  it("clear removes empty drafts on save", () => {
    saveChatDraft("t1", "x");
    saveChatDraft("t1", "   ");
    expect(loadChatDraft("t1")).toBe("");
  });
});

describe("page-context tier19", () => {
  it("formatPageContextSnippet includes badge and extras", () => {
    const snippet = formatPageContextSnippet({
      activeNav: "versions",
      route: "versions",
      appsSummary: { total: 10, hasUpdate: 2, samples: ["A"] },
    });
    expect(snippet).toContain("版本检查");
    expect(snippet).toContain("2 个应用待更新");
  });
});
