import { describe, expect, it } from "vitest";
import { resolveStockIntentChip } from "../../src/ai/assistant-interpret-tools";

describe("assistant-interpret-tools", () => {
  it("resolveStockIntentChip maps id and Chinese label", () => {
    expect(resolveStockIntentChip("low_value").id).toBe("low_value");
    expect(resolveStockIntentChip("高分红").id).toBe("high_div");
    expect(resolveStockIntentChip("").id).toBe("balanced");
  });
});
