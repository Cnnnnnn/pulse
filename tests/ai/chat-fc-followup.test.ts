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

  it("同名并行调用按位对齐, 不再按 tool 名串结果", () => {
    const base = [{ role: "user", content: "查应用" }];
    const out = appendFcToolResults(
      base,
      {
        protocol: "openai",
        toolCalls: [
          { id: "c1", tool: "query_apps", params: { filter: "all" } },
          { id: "c2", tool: "query_apps", params: { filter: "pending" } },
        ],
      },
      [
        { tool: "query_apps", ok: true, summary: "全部:13 个" },
        { tool: "query_apps", ok: true, summary: "待更新:2 个" },
      ],
      "",
    );
    const toolMsgs = out.filter((m: any) => m.role === "tool");
    expect(toolMsgs).toHaveLength(2);
    expect(String((toolMsgs[0] as any).content)).toContain("全部:13 个");
    expect(String((toolMsgs[1] as any).content)).toContain("待更新:2 个");
  });

  it("结果缺位 (renderer 工具/null) → 该调用得到「无结果」占位", () => {
    const base = [{ role: "user", content: "打开并查询" }];
    const out = appendFcToolResults(
      base,
      {
        protocol: "openai",
        toolCalls: [
          { id: "c1", tool: "navigate", params: { nav: "library" } },
          { id: "c2", tool: "query_apps", params: {} },
        ],
      },
      [null, { tool: "query_apps", ok: true, summary: "ok" }],
      "",
    );
    const toolMsgs = out.filter((m: any) => m.role === "tool");
    expect(String((toolMsgs[0] as any).content)).toContain("无结果");
    expect(String((toolMsgs[1] as any).content)).toContain("ok");
  });
});
