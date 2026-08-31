import { describe, expect, it } from "vitest";
import {
  ASSISTANT_FEW_SHOT_EXAMPLES,
  formatAssistantFewShotBlock,
} from "../../src/ai/assistant-prompt-fewshot";

describe("assistant-prompt-fewshot", () => {
  it("includes core regression examples", () => {
    const ids = ASSISTANT_FEW_SHOT_EXAMPLES.map((e) => e.user);
    expect(ids).toContain("打开应用列表");
    expect(ids).toContain("八仙!");
    expect(ids).toContain("需要");
  });

  it("formatAssistantFewShotBlock for FC mentions tool names", () => {
    const block = formatAssistantFewShotBlock(true);
    expect(block).toContain("pulse_open");
    expect(block).toContain("pulse://nav/versions");
    expect(block).toContain("query_apps");
  });

  it("formatAssistantFewShotBlock for XML emits action tags", () => {
    const block = formatAssistantFewShotBlock(false);
    expect(block).toContain("<action>");
    expect(block).toContain("pulse_open");
  });
});
