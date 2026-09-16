import { describe, expect, it } from "vitest";
import {
  buildAssistantSystemPrompt,
  formatNowForPrompt,
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

  it("注入当前时间（解析相对时间与推算 triggerAt 的前提）", () => {
    const prompt = buildAssistantSystemPrompt({
      now: new Date(2026, 8, 16, 18, 30),
    });
    expect(prompt).toContain("当前时间：2026-09-16 (周三) 18:30");
    expect(prompt).toContain("以「当前时间」为准换算");
  });

  it("未传 now 时使用真实当前时间，格式合法", () => {
    const prompt = buildAssistantSystemPrompt({});
    expect(prompt).toMatch(
      /当前时间：\d{4}-\d{2}-\d{2} \(周[日一二三四五六]\) \d{2}:\d{2}/,
    );
  });

  it("formatNowForPrompt 日期与时间均补零、星期正确", () => {
    expect(formatNowForPrompt(new Date(2026, 8, 5, 9, 5))).toBe(
      "2026-09-05 (周六) 09:05",
    );
    expect(formatNowForPrompt(new Date(2026, 11, 31, 23, 59))).toBe(
      "2026-12-31 (周四) 23:59",
    );
  });

  it("system prompt 要求来源标注", () => {
    const p = buildAssistantSystemPrompt({ useFunctionCalling: true });
    expect(p).toContain("来源");
  });
});
