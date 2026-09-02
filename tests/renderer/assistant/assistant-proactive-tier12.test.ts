import { describe, expect, it } from "vitest";
import {
  buildAppUpdateSystemMessage,
  buildGithubUpdateSystemMessage,
  injectProactiveSystemMessage,
} from "../../../src/renderer/assistant/assistant-proactive.ts";

describe("assistant-proactive tier12", () => {
  it("injectProactiveSystemMessage is stable without pending data", () => {
    const msgs = injectProactiveSystemMessage([]);
    expect(msgs).toEqual([]);
  });

  it("buildAppUpdateSystemMessage returns null when no unseen apps", () => {
    expect(buildAppUpdateSystemMessage()).toBeNull();
  });

  it("buildGithubUpdateSystemMessage returns null when no unseen github", () => {
    expect(buildGithubUpdateSystemMessage()).toBeNull();
  });
});
