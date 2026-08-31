import { describe, expect, it, beforeEach } from "vitest";
import {
  loadMessageSearchDraft,
  saveMessageSearchDraft,
  clearMessageSearchDraft,
} from "../../../src/renderer/assistant/chat-message-search-draft";
import { splitTextBySearchHighlight } from "../../../src/renderer/assistant/chat-message-search";

describe("chat-message-search-draft tier25", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists search query per thread", () => {
    saveMessageSearchDraft("t1", "基金");
    expect(loadMessageSearchDraft("t1")).toBe("基金");
    expect(loadMessageSearchDraft("t2")).toBe("");
  });

  it("clears empty query on save", () => {
    saveMessageSearchDraft("t1", "abc");
    saveMessageSearchDraft("t1", "   ");
    expect(loadMessageSearchDraft("t1")).toBe("");
  });

  it("clearMessageSearchDraft removes entry", () => {
    saveMessageSearchDraft("t1", "x");
    clearMessageSearchDraft("t1");
    expect(loadMessageSearchDraft("t1")).toBe("");
  });
});

describe("splitTextBySearchHighlight tier25", () => {
  it("splits text into match parts", () => {
    expect(splitTextBySearchHighlight("基金盈亏怎样", "基金")).toEqual([
      { text: "基金", match: true },
      { text: "盈亏怎样", match: false },
    ]);
  });

  it("matches case-insensitively", () => {
    const parts = splitTextBySearchHighlight("Hello WORLD", "world");
    expect(parts.some((p) => p.match && p.text === "WORLD")).toBe(true);
  });

  it("returns single part when query empty", () => {
    expect(splitTextBySearchHighlight("abc", "")).toEqual([
      { text: "abc", match: false },
    ]);
  });
});
