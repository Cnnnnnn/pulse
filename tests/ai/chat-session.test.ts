import { describe, expect, it } from "vitest";
import {
  beginChatSession,
  cancelChatSession,
  endChatSession,
} from "../../src/ai/chat-session";

describe("chat-session", () => {
  it("cancelChatSession aborts active session", () => {
    const s = beginChatSession();
    expect(s.isAborted()).toBe(false);
    expect(cancelChatSession(s.id)).toBe(true);
    expect(s.isAborted()).toBe(true);
    endChatSession(s.id);
  });

  it("cancelChatSession returns false when no session", () => {
    expect(cancelChatSession()).toBe(false);
  });
});
