import { describe, expect, it } from "vitest";
import { appendFcToolResults } from "../../src/ai/chat-fc-followup";

describe("chat-fc-followup", () => {
  it("appendFcToolResults adds OpenAI tool messages", () => {
    const base = [{ role: "user", content: "查基金" }];
    const out = appendFcToolResults(
      base,
      {
        protocol: "openai",
        toolCalls: [{ id: "call_1", tool: "query_funds", params: {} }],
      },
      [{ tool: "query_funds", ok: true, summary: "共3只基金" }],
      "好的",
    );
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({ role: "assistant" });
    expect(out[2]).toMatchObject({ role: "tool", tool_call_id: "call_1" });
  });
});
