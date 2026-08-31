import { describe, expect, it } from "vitest";
import {
  formatModelPresetsText,
  formatThreadModelLabel,
  guessModelProvider,
  isModelLikelyForProvider,
  listAssistantModelPresets,
  parseModelPresetsText,
  partitionModelPresetsByProvider,
} from "../../../src/renderer/assistant/assistant-model-presets";

describe("assistant-model-presets", () => {
  it("parseModelPresetsText splits lines and commas", () => {
    expect(parseModelPresetsText("a\nb, c")).toEqual(["a", "b", "c"]);
  });

  it("formatModelPresetsText joins presets", () => {
    expect(formatModelPresetsText(["x", "y"])).toBe("x\ny");
  });

  it("listAssistantModelPresets merges cloud and custom presets", () => {
    const presets = listAssistantModelPresets({
      cloud: { providerId: "deepseek", model: "deepseek-chat" },
      assistantFastModel: "fast-model",
      assistantModelPresets: ["custom-a"],
    });
    expect(presets).toContain("deepseek-chat");
    expect(presets).toContain("fast-model");
    expect(presets).toContain("custom-a");
  });

  it("guessModelProvider detects deepseek and glm", () => {
    expect(guessModelProvider("deepseek-chat")).toBe("deepseek");
    expect(guessModelProvider("glm-4.6")).toBe("glm");
  });

  it("partitionModelPresetsByProvider splits mismatched presets", () => {
    const { matched, mismatched } = partitionModelPresetsByProvider(
      ["deepseek-chat", "gpt-4o-mini"],
      "deepseek",
    );
    expect(matched).toEqual(["deepseek-chat"]);
    expect(mismatched).toEqual(["gpt-4o-mini"]);
    expect(isModelLikelyForProvider("gpt-4o-mini", "deepseek")).toBe(false);
  });

  it("formatThreadModelLabel reflects mode", () => {
    expect(
      formatThreadModelLabel(
        { cloud: { providerId: "deepseek", model: "deepseek-chat" } },
        { mode: "default" },
      ),
    ).toBe("默认 · deepseek-chat");
    expect(
      formatThreadModelLabel(
        { cloud: { providerId: "deepseek" }, assistantFastModel: "mini" },
        { mode: "fast" },
      ),
    ).toBe("轻量 · mini");
  });
});
