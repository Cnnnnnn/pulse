import { describe, expect, it, beforeEach } from "vitest";
import { formatMessageTime } from "../../../src/renderer/assistant/chat-message-time";
import {
  loadAttachPageContext,
  saveAttachPageContext,
} from "../../../src/renderer/assistant/chat-attach-context";
import { proactiveKindFromMessage } from "../../../src/renderer/assistant/assistant-proactive-sync";

describe("chat-message-time tier20", () => {
  it("formatMessageTime returns empty for invalid ts", () => {
    expect(formatMessageTime(undefined)).toBe("");
    expect(formatMessageTime(NaN)).toBe("");
  });

  it("formatMessageTime formats valid timestamp", () => {
    const label = formatMessageTime(
      new Date("2026-08-28T14:30:00").getTime(),
    );
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("chat-attach-context tier20", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("defaults to attach when unset", () => {
    expect(loadAttachPageContext("t1")).toBe(true);
    expect(loadAttachPageContext(null)).toBe(true);
  });

  it("persists opt-out per thread", () => {
    saveAttachPageContext("t1", false);
    expect(loadAttachPageContext("t1")).toBe(false);
    saveAttachPageContext("t1", true);
    expect(loadAttachPageContext("t1")).toBe(true);
  });

  it("threads are independent", () => {
    saveAttachPageContext("a", false);
    expect(loadAttachPageContext("a")).toBe(false);
    expect(loadAttachPageContext("b")).toBe(true);
  });
});

describe("proactiveKindFromMessage tier20", () => {
  it("detects proactive system marker", () => {
    const kind = proactiveKindFromMessage({
      role: "system",
      content: "[pulse-proactive:apps:fp1]\n📱 应用更新提醒",
    });
    expect(kind).toBe("apps");
  });

  it("returns null for non-system or plain system", () => {
    expect(
      proactiveKindFromMessage({ role: "user", content: "hi" }),
    ).toBeNull();
    expect(
      proactiveKindFromMessage({ role: "system", content: "plain" }),
    ).toBeNull();
  });
});
