/**
 * Function Calling 回合元数据 — 用于 tool_result 回注.
 */
import type { ToolResult } from "./assistant-tools";

export type FcToolCall = {
  id: string;
  tool: string;
  params: Record<string, unknown>;
};

export type FcRoundMeta = {
  protocol: "openai" | "anthropic";
  toolCalls: FcToolCall[];
};

function resultForCall(
  call: FcToolCall,
  results: ToolResult[],
  index: number,
): string {
  const hit = results.find((r) => r.tool === call.tool);
  const r = hit || results[index];
  return r?.summary || "无结果";
}

/**
 * 在 FC 工具执行后，把 assistant tool_use / tool_result 追加到消息链.
 */
export function appendFcToolResults(
  baseMessages: Array<Record<string, unknown>>,
  meta: FcRoundMeta,
  results: ToolResult[],
  assistantText?: string,
): Array<Record<string, unknown>> {
  const out = [...baseMessages];

  if (meta.protocol === "openai") {
    out.push({
      role: "assistant",
      content: assistantText || null,
      tool_calls: meta.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: {
          name: c.tool,
          arguments: JSON.stringify(c.params || {}),
        },
      })),
    });
    for (let i = 0; i < meta.toolCalls.length; i++) {
      const call = meta.toolCalls[i];
      out.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultForCall(call, results, i),
      });
    }
    return out;
  }

  if (meta.protocol === "anthropic") {
    const content: Array<Record<string, unknown>> = [];
    if (assistantText) {
      content.push({ type: "text", text: assistantText });
    }
    for (const c of meta.toolCalls) {
      content.push({
        type: "tool_use",
        id: c.id,
        name: c.tool,
        input: c.params || {},
      });
    }
    out.push({ role: "assistant", content });
    out.push({
      role: "user",
      content: meta.toolCalls.map((c, i) => ({
        type: "tool_result",
        tool_use_id: c.id,
        content: resultForCall(c, results, i),
      })),
    });
    return out;
  }

  return out;
}

module.exports = { appendFcToolResults };
