import { describe, expect, it } from "vitest";
import { resolveFcToolPolicy } from "../../src/ai/fc-tool-policy";
import { wantsUiTool } from "../../src/shared/pulse-infer-registry";

describe("fc-tool-policy", () => {
  it("wantsUiTool aligns with resolveFcToolPolicy", () => {
    const ctx = { userText: "打开应用列表页面" };
    expect(wantsUiTool(ctx)).toBe(true);
    expect(resolveFcToolPolicy(ctx).forceUiTool).toBe(true);
    expect(resolveFcToolPolicy(ctx).openAiToolChoice).toBe("required");
    expect(resolveFcToolPolicy(ctx).anthropicToolChoice).toEqual({ type: "any" });
  });

  it("does not force tools for pure data queries", () => {
    const ctx = { userText: "有哪些应用需要更新？" };
    expect(wantsUiTool(ctx)).toBe(false);
    expect(resolveFcToolPolicy(ctx).forceUiTool).toBe(false);
    expect(resolveFcToolPolicy(ctx).openAiToolChoice).toBe("auto");
  });

  it("forces UI tools on affirmation after offer", () => {
    const ctx = {
      userText: "需要",
      priorAssistantText: "要不要打开电影页面看看？",
    };
    expect(resolveFcToolPolicy(ctx).forceUiTool).toBe(true);
  });
});
