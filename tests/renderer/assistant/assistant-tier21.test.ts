import { describe, expect, it, beforeEach } from "vitest";
import {
  loadExportIncludeSystem,
  saveExportIncludeSystem,
} from "../../../src/renderer/assistant/chat-export-prefs";
import { nextMessageFeedback } from "../../../src/renderer/assistant/chat-message-feedback";
import {
  messagesForShare,
  messagesToMarkdown,
} from "../../../src/renderer/assistant/chat-export";

describe("chat-export-prefs tier21", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("defaults to exclude system", () => {
    expect(loadExportIncludeSystem()).toBe(false);
  });

  it("persists include system preference", () => {
    saveExportIncludeSystem(true);
    expect(loadExportIncludeSystem()).toBe(true);
    saveExportIncludeSystem(false);
    expect(loadExportIncludeSystem()).toBe(false);
  });
});

describe("chat-message-feedback tier21", () => {
  it("toggles feedback off when same vote", () => {
    expect(nextMessageFeedback("up", "up")).toBeUndefined();
    expect(nextMessageFeedback("down", "down")).toBeUndefined();
  });

  it("switches between up and down", () => {
    expect(nextMessageFeedback(undefined, "up")).toBe("up");
    expect(nextMessageFeedback("up", "down")).toBe("down");
  });
});

describe("chat-export tier21", () => {
  it("includes system messages when excludeSystem is false", () => {
    const msgs = [
      { role: "user" as const, content: "hi" },
      { role: "system" as const, content: "alert" },
      { role: "assistant" as const, content: "ok" },
    ];
    expect(messagesForShare(msgs, { excludeSystem: false })).toHaveLength(3);
    expect(messagesToMarkdown(msgs, { excludeSystem: false })).toContain(
      "## 系统",
    );
  });
});
