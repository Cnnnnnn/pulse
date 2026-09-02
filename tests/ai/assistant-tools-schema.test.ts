import { describe, expect, it } from "vitest";
import {
  ASSISTANT_TOOL_DEFS,
  TOOL_NAMES,
  toOpenAiTools,
  toAnthropicTools,
  validateToolCall,
} from "../../src/ai/assistant-tools-schema";

describe("assistant-tools-schema", () => {
  it("defines upgrade_app and all tools have schemas", () => {
    expect(TOOL_NAMES.has("upgrade_app")).toBe(true);
    expect(TOOL_NAMES.has("query_funds")).toBe(true);
    expect(TOOL_NAMES.has("query_movies")).toBe(true);
    expect(TOOL_NAMES.has("interpret_finance")).toBe(true);
    expect(ASSISTANT_TOOL_DEFS.length).toBeGreaterThanOrEqual(31);
    expect(TOOL_NAMES.has("add_concert_watch")).toBe(true);
    expect(TOOL_NAMES.has("query_concerts")).toBe(true);
    expect(ASSISTANT_TOOL_DEFS[0].name).toBe("pulse_open");
    for (const t of ASSISTANT_TOOL_DEFS) {
      expect(t.name).toBeTruthy();
      expect(t.parameters.type).toBe("object");
    }
  });

  it("converts to OpenAI and Anthropic tool formats", () => {
    const openai = toOpenAiTools();
    const anthropic = toAnthropicTools();
    expect(openai[0].type).toBe("function");
    expect(openai[0].function.name).toBe(ASSISTANT_TOOL_DEFS[0].name);
    expect(anthropic[0].input_schema).toEqual(ASSISTANT_TOOL_DEFS[0].parameters);
  });

  it("validateToolCall 校验 tool 名白名单 + required + enum", () => {
    // 合法调用
    expect(validateToolCall("query_apps", {}).valid).toBe(true);
    expect(validateToolCall("search", { q: "基金" }).valid).toBe(true);
    expect(validateToolCall("navigate", { nav: "invest", tab: "stocks" }).valid).toBe(true);
    // 未知 / 非字符串 tool 名
    expect(validateToolCall("no_such_tool", {}).valid).toBe(false);
    expect(validateToolCall(123, {}).valid).toBe(false);
    // required 缺失
    expect(validateToolCall("navigate", {}).valid).toBe(false); // nav 必填
    expect(validateToolCall("search", {}).valid).toBe(false); // q 必填
    // enum 越界
    expect(validateToolCall("navigate", { nav: "invest", tab: "bogus" }).valid).toBe(false);
    // 类型不符
    expect(validateToolCall("query_leaderboard", { limit: "5" }).valid).toBe(false);
    expect(validateToolCall("query_leaderboard", { limit: 5 }).valid).toBe(true);
  });
});
