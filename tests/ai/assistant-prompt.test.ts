import { describe, expect, it } from "vitest";
import {
  buildAssistantSystemPrompt,
  parseAssistantActions,
  stripActionTags,
  untrustedToolResult,
  MAX_TOOL_RESULT_CHARS,
  MAIN_PROCESS_TOOLS,
  RENDERER_TOOLS,
} from "../../src/ai/assistant-prompt";

describe("assistant-prompt", () => {
  it("buildAssistantSystemPrompt FC mode is slim with few-shot", () => {
    const p = buildAssistantSystemPrompt({
      activeNav: "invest",
      route: "library",
      pageSnapshot: "investTab=funds",
      useFunctionCalling: true,
    });
    expect(p).toContain("invest");
    expect(p).toContain("pulse_open");
    expect(p).toContain("pulse://nav/versions");
    expect(p).toContain("打开应用列表");
    expect(p).toContain("Function Calling");
    expect(p).toContain("investTab=funds");
    expect(p).not.toContain("35. open_stock_diagnosis");
    expect(p).not.toContain("10. query_leaderboard");
  });

  it("buildAssistantSystemPrompt XML mode keeps tool list", () => {
    const p = buildAssistantSystemPrompt({
      useFunctionCalling: false,
    });
    expect(p).toContain("<action>");
    expect(p).toContain("query_apps");
    expect(p).toContain("open_movie_detail");
  });

  it("parseAssistantActions extracts JSON from action tags", () => {
    const text =
      '好的，我来查一下。<action>{"tool":"query_apps","params":{}}</action>';
    const actions = parseAssistantActions(text);
    expect(actions).toEqual([{ tool: "query_apps", params: {} }]);
    expect(stripActionTags(text)).toBe("好的，我来查一下。");
  });

  it("parseAssistantActions skips invalid JSON", () => {
    const text = '<action>{bad json}</action>正常回复';
    expect(parseAssistantActions(text)).toEqual([]);
    expect(stripActionTags(text)).toBe("正常回复");
  });

  it("tool sets are disjoint", () => {
    for (const t of MAIN_PROCESS_TOOLS) {
      expect(RENDERER_TOOLS.has(t)).toBe(false);
    }
  });

  it("untrustedToolResult 包不可信数据边界并截断", () => {
    const s = untrustedToolResult("search", "找到 5 条");
    expect(s).toContain("不可信数据");
    expect(s).toContain("找到 5 条");
    expect(s).toContain("来源");
    const long = "x".repeat(MAX_TOOL_RESULT_CHARS + 100);
    const t = untrustedToolResult("query_apps", long);
    expect(t).toContain("已截断");
    expect(t.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 150);
  });

  it("system prompt 要求来源标注", () => {
    const p = buildAssistantSystemPrompt({ useFunctionCalling: true });
    expect(p).toContain("来源");
  });
});
