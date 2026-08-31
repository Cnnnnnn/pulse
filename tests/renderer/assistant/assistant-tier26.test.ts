import { describe, expect, it } from "vitest";
import {
  sanitizeExportFilename,
  messagesToMarkdown,
} from "../../../src/renderer/assistant/chat-export";
import {
  messageMatchesRoleFilter,
  countMessagesForRoleFilter,
} from "../../../src/renderer/assistant/chat-message-filter";

describe("chat-export tier26", () => {
  it("sanitizeExportFilename removes unsafe chars", () => {
    expect(sanitizeExportFilename('基金/讨论: "test"')).toBe("基金讨论-test");
    expect(sanitizeExportFilename("   ")).toBe("pulse-chat");
  });

  it("messagesToMarkdown includes title and export time", () => {
    const md = messagesToMarkdown(
      [{ role: "user", content: "hi" }],
      { title: "基金讨论", exportedAt: new Date("2026-08-28T12:00:00").getTime() },
    );
    expect(md).toContain("# 基金讨论");
    expect(md).toContain("导出时间");
    expect(md).toContain("## 你");
  });
});

describe("chat-message-filter tier26", () => {
  const msgs = [
    { role: "user" as const, content: "a" },
    { role: "assistant" as const, content: "b" },
    { role: "system" as const, content: "c" },
  ];

  it("messageMatchesRoleFilter filters by role", () => {
    expect(messageMatchesRoleFilter(msgs[0], "user")).toBe(true);
    expect(messageMatchesRoleFilter(msgs[0], "assistant")).toBe(false);
    expect(messageMatchesRoleFilter(msgs[0], "all")).toBe(true);
  });

  it("countMessagesForRoleFilter counts matches", () => {
    expect(countMessagesForRoleFilter(msgs, "assistant")).toBe(1);
    expect(countMessagesForRoleFilter(msgs, "all")).toBe(3);
  });
});
