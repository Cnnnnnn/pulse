import { describe, expect, it } from "vitest";
import { MAX_ROUNDS } from "../../src/ai/assistant-agent";

describe("assistant-agent", () => {
  it("MAX_ROUNDS is 4 for multi-step tool chains", () => {
    expect(MAX_ROUNDS).toBe(4);
  });
});
