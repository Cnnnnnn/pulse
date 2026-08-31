import { describe, expect, it } from "vitest";
import {
  formatToolStatusMessage,
  ASSISTANT_TOOL_STATUS,
} from "../../src/shared/assistant-tool-labels";

describe("assistant-tool-labels", () => {
  it("formatToolStatusMessage handles single and multiple tools", () => {
    expect(formatToolStatusMessage(["query_funds"])).toBe("正在查询基金持仓…");
    expect(formatToolStatusMessage(["query_funds", "query_metals"])).toBe(
      "正在查询：基金持仓、贵金属行情…",
    );
    expect(formatToolStatusMessage([])).toBe("正在查询…");
  });

  it("covers main assistant tools", () => {
    expect(ASSISTANT_TOOL_STATUS.query_github).toBeTruthy();
    expect(ASSISTANT_TOOL_STATUS.query_ai_usage).toBeTruthy();
  });
});
