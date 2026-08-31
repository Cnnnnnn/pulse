import { describe, expect, it } from "vitest";
import {
  filterThreads,
  normalizeThreadTitle,
} from "../../../src/renderer/assistant/chat-threads";
import {
  formatPageContextBadge,
  type PageContextSnapshot,
} from "../../../src/renderer/assistant/page-context";

describe("chat-threads tier17", () => {
  it("normalizeThreadTitle trims and caps length", () => {
    expect(normalizeThreadTitle("  hello  ")).toBe("hello");
    expect(normalizeThreadTitle("")).toBe("新对话");
    expect(normalizeThreadTitle("x".repeat(50)).length).toBeLessThanOrEqual(41);
  });

  it("filterThreads matches title and message content", () => {
    const threads = [
      {
        id: "a",
        title: "基金讨论",
        updatedAt: 1,
        messages: [{ role: "user" as const, content: "黄金怎么样" }],
      },
      {
        id: "b",
        title: "版本",
        updatedAt: 2,
        messages: [{ role: "user" as const, content: "更新" }],
      },
    ];
    expect(filterThreads(threads, "黄金")).toHaveLength(1);
    expect(filterThreads(threads, "版本")).toHaveLength(1);
  });
});

describe("page-context tier17", () => {
  it("formatPageContextBadge shows invest tab", () => {
    const ctx: PageContextSnapshot = {
      activeNav: "invest",
      route: "funds",
      investTab: "funds",
    };
    expect(formatPageContextBadge(ctx)).toBe("投资 · 基金");
  });
});
