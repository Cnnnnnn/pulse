import { describe, expect, it } from "vitest";
import { getQuickActionsForNav } from "../../../src/renderer/assistant/chat-quick-actions";

describe("chat-quick-actions tier15", () => {
  it("prioritizes concerts actions on concerts nav", () => {
    const actions = getQuickActionsForNav("concerts");
    expect(actions[0]?.id).toBe("concerts");
    expect(actions[1]?.id).toBe("refresh-concerts");
  });

  it("prioritizes updates on versions nav", () => {
    const actions = getQuickActionsForNav("versions");
    expect(actions[0]?.id).toBe("updates");
    expect(actions[1]?.id).toBe("check");
  });

  it("caps action count", () => {
    expect(getQuickActionsForNav("home", 5)).toHaveLength(5);
  });
});
