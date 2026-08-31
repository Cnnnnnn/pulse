import { describe, expect, it } from "vitest";
import {
  summarizeThreadStats,
  formatThreadStatsLabel,
  formatThreadStatsTitle,
} from "../../../src/renderer/assistant/chat-thread-stats";
import {
  shouldCollapseMessage,
  collapseMessagePreview,
  MESSAGE_COLLAPSE_CHAR_LIMIT,
} from "../../../src/renderer/assistant/chat-message-collapse";

describe("chat-thread-stats tier24", () => {
  it("summarizeThreadStats counts roles and turns", () => {
    const stats = summarizeThreadStats([
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok" },
      { role: "system", content: "alert" },
      { role: "user", content: "again" },
    ]);
    expect(stats).toEqual({
      total: 4,
      user: 2,
      assistant: 1,
      system: 1,
      turns: 2,
    });
  });

  it("formatThreadStatsLabel shows turns", () => {
    expect(formatThreadStatsLabel(summarizeThreadStats([]))).toBe("空对话");
    expect(
      formatThreadStatsLabel(
        summarizeThreadStats([{ role: "user", content: "a" }]),
      ),
    ).toBe("1 条 · 1 轮");
  });

  it("formatThreadStatsTitle includes breakdown", () => {
    const title = formatThreadStatsTitle(
      summarizeThreadStats([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ]),
    );
    expect(title).toContain("2 条消息");
    expect(title).toContain("1 轮对话");
  });
});

describe("chat-message-collapse tier24", () => {
  it("shouldCollapseMessage respects limit and expanded state", () => {
    const long = "x".repeat(MESSAGE_COLLAPSE_CHAR_LIMIT + 1);
    expect(shouldCollapseMessage("assistant", long, false)).toBe(true);
    expect(shouldCollapseMessage("assistant", long, true)).toBe(false);
    expect(shouldCollapseMessage("system", long, false)).toBe(false);
  });

  it("collapseMessagePreview truncates with ellipsis", () => {
    const long = "a".repeat(500);
    const preview = collapseMessagePreview(long, 10);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThan(long.length);
  });
});
