import { describe, expect, it } from "vitest";
import { isProactiveKind } from "../../../src/renderer/assistant/assistant-proactive";

describe("assistant-proactive tier15", () => {
  it("isProactiveKind guards known kinds", () => {
    expect(isProactiveKind("concert")).toBe(true);
    expect(isProactiveKind("apps")).toBe(true);
    expect(isProactiveKind("github")).toBe(true);
    expect(isProactiveKind("other")).toBe(false);
    expect(isProactiveKind(null)).toBe(false);
  });
});
