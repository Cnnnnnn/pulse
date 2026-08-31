import { describe, expect, it } from "vitest";
import { RENDERER_TOOLS } from "../../../src/ai/assistant-prompt.ts";
import {
  CONFIRM_MESSAGE_BUILDERS,
  RENDERER_ACTION_HANDLERS,
} from "../../../src/renderer/assistant/assistant-action-handlers.ts";
import { CONFIRM_REQUIRED_TOOLS } from "../../../src/ai/assistant-prompt.ts";

describe("assistant-action-handlers registry", () => {
  it("covers every renderer tool except pulse_open (normalized before execute)", () => {
    const expected = [...RENDERER_TOOLS].filter((t) => t !== "pulse_open");
    expect(Object.keys(RENDERER_ACTION_HANDLERS).sort()).toEqual(expected.sort());
  });

  it("has confirm builders for all confirm-required tools", () => {
    for (const tool of CONFIRM_REQUIRED_TOOLS) {
      expect(CONFIRM_MESSAGE_BUILDERS[tool], tool).toBeTypeOf("function");
    }
  });
});
