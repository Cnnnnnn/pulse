/**
 * FC 流式 — Round 0 边出字边收 tool_calls（OpenAI + Anthropic）.
 */
import { sanitizeLlmOutput } from "./sanitize-llm-output";
import { recordTokenSpend } from "./shared-llm";
import { resolveMaxOutputTokens } from "./default-models";
import type { AssistantAction } from "./assistant-prompt";
import { buildAnthropicFcRequest, buildOpenAiFcRequest } from "./fc-tool-policy";
import type { AssistantPageCtx } from "../shared/assistant-page-tools";
import type { UiInferContext } from "../shared/pulse-href";
import type { FcRoundMeta, FcToolCall } from "./chat-fc-followup";
import { ANTHROPIC_VERSION } from "../ai-sessions/provider-cloud";

const https = require("node:https");
const { URL } = require("node:url");

type ToolCallAccum = {
  id?: string;
  name?: string;
  arguments: string;
};

function joinUrl(baseUrl: string, path: string): string {
  if (path.startsWith("/v1/") && baseUrl.endsWith("/v1")) {
    return `${baseUrl}${path.slice(3)}`;
  }
  return `${baseUrl}${path}`;
}

export function mergeToolCallDelta(
  acc: Map<number, ToolCallAccum>,
  toolCalls: unknown,
): void {
  if (!Array.isArray(toolCalls)) return;
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== "object") continue;
    const row = tc as {
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    };
    const idx = row.index ?? 0;
    let entry = acc.get(idx);
    if (!entry) {
      entry = { arguments: "" };
      acc.set(idx, entry);
    }
    if (row.id) entry.id = row.id;
    if (row.function?.name) entry.name = row.function.name;
    if (row.function?.arguments) entry.arguments += row.function.arguments;
  }
}

function toolCallsFromAccum(acc: Map<number, ToolCallAccum>): {
  actions: AssistantAction[];
  fc: FcToolCall[];
} {
  const actions: AssistantAction[] = [];
  const fc: FcToolCall[] = [];
  const indices = [...acc.keys()].sort((a, b) => a - b);
  for (const idx of indices) {
    const entry = acc.get(idx);
    if (!entry?.name) continue;
    let params: Record<string, unknown> = {};
    try {
      params = entry.arguments ? JSON.parse(entry.arguments) : {};
    } catch {
      params = {};
    }
    const id = entry.id || `call_${fc.length}`;
    actions.push({ tool: entry.name, params });
    fc.push({ id, tool: entry.name, params });
  }
  return { actions, fc };
}

export type AnthropicToolAccum = {
  id: string;
  name: string;
  inputJson: string;
};

export type AnthropicStreamState = {
  fullText: string;
  tools: AnthropicToolAccum[];
  currentTool: AnthropicToolAccum | null;
};

export function createAnthropicStreamState(): AnthropicStreamState {
  return { fullText: "", tools: [], currentTool: null };
}

/** 解析 Anthropic SSE 单条 event（可单测） */
export function applyAnthropicStreamEvent(
  event: { type?: string; [key: string]: unknown },
  state: AnthropicStreamState,
  onDelta?: (delta: string) => void,
): void {
  const type = event.type;
  if (type === "content_block_start") {
    const block = event.content_block as {
      type?: string;
      id?: string;
      name?: string;
    };
    if (block?.type === "tool_use" && block.id && block.name) {
      state.currentTool = {
        id: block.id,
        name: block.name,
        inputJson: "",
      };
    }
  }
  if (type === "content_block_delta") {
    const delta = event.delta as {
      type?: string;
      text?: string;
      partial_json?: string;
    };
    if (delta?.type === "text_delta" && delta.text) {
      state.fullText += delta.text;
      onDelta?.(delta.text);
    }
    if (
      delta?.type === "input_json_delta" &&
      delta.partial_json &&
      state.currentTool
    ) {
      state.currentTool.inputJson += delta.partial_json;
    }
  }
  if (type === "content_block_stop" && state.currentTool) {
    state.tools.push(state.currentTool);
    state.currentTool = null;
  }
}

function anthropicToolsToFc(tools: AnthropicToolAccum[]): {
  actions: AssistantAction[];
  fc: FcToolCall[];
} {
  const actions: AssistantAction[] = [];
  const fc: FcToolCall[] = [];
  for (const t of tools) {
    let params: Record<string, unknown> = {};
    try {
      params = t.inputJson ? JSON.parse(t.inputJson) : {};
    } catch {
      params = {};
    }
    actions.push({ tool: t.name, params });
    fc.push({ id: t.id, tool: t.name, params });
  }
  return { actions, fc };
}

function postSseStream(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  onEvent: (data: string) => void,
  opts: {
    isAborted?: () => boolean;
    onAbortRegister?: (fn: () => void) => void;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.isAborted?.()) {
      reject(new Error("cancelled"));
      return;
    }
    const payload = JSON.stringify({ ...body, stream: true });
    const u = new URL(url);
    let sseBuf = "";
    let settled = false;

    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res: {
        statusCode?: number;
        on: (ev: string, fn: (...args: unknown[]) => void) => void;
      }) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errBody = "";
          res.on("data", (chunk: unknown) => {
            if (errBody.length < 2048) {
              errBody += Buffer.isBuffer(chunk)
                ? chunk.toString("utf8")
                : String(chunk);
            }
          });
          res.on("end", () => {
            if (!settled) {
              settled = true;
              reject(
                new Error(
                  `stream_http_${res.statusCode}: ${errBody.slice(0, 256)}`,
                ),
              );
            }
          });
          return;
        }
        res.on("data", (chunk: unknown) => {
          if (opts.isAborted?.()) {
            if (!settled) {
              settled = true;
              req.destroy();
              resolve();
            }
            return;
          }
          sseBuf += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
          const lines = sseBuf.split("\n");
          sseBuf = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data) continue;
            onEvent(data);
          }
        });
        res.on("end", () => {
          if (sseBuf.trim().startsWith("data:")) {
            onEvent(sseBuf.trim().slice(5).trim());
          }
          if (!settled) {
            settled = true;
            resolve();
          }
        });
      },
    );
    opts.onAbortRegister?.(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        resolve();
      }
    });
    req.on("error", reject);
    req.setTimeout(120_000, () => {
      req.destroy();
      reject(new Error("stream_timeout"));
    });
    req.write(payload);
    req.end();
  });
}

function postOpenAiFcStream(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  opts: {
    onDelta?: (delta: string) => void;
    isAborted?: () => boolean;
    onAbortRegister?: (fn: () => void) => void;
  },
): Promise<{ text: string; toolAcc: Map<number, ToolCallAccum>; totalTokens: number }> {
  return new Promise((resolve, reject) => {
    if (opts.isAborted?.()) {
      reject(new Error("cancelled"));
      return;
    }
    const payload = JSON.stringify({ ...body, stream: true });
    const u = new URL(url);
    let fullText = "";
    let sseBuf = "";
    let settled = false;
    let totalTokens = 0;
    const toolAcc = new Map<number, ToolCallAccum>();

    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res: {
        statusCode?: number;
        on: (ev: string, fn: (...args: unknown[]) => void) => void;
      }) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errBody = "";
          res.on("data", (chunk: unknown) => {
            if (errBody.length < 2048) {
              errBody += Buffer.isBuffer(chunk)
                ? chunk.toString("utf8")
                : String(chunk);
            }
          });
          res.on("end", () => {
            if (!settled) {
              settled = true;
              reject(new Error(`stream_http_${res.statusCode}: ${errBody.slice(0, 256)}`));
            }
          });
          return;
        }
        res.on("data", (chunk: unknown) => {
          if (opts.isAborted?.()) {
            if (!settled) {
              settled = true;
              req.destroy();
              resolve({ text: fullText, toolAcc, totalTokens });
            }
            return;
          }
          sseBuf += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
          const lines = sseBuf.split("\n");
          sseBuf = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const j = JSON.parse(data) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                    tool_calls?: unknown;
                  };
                }>;
                usage?: { total_tokens?: number };
              };
              if (typeof j.usage?.total_tokens === "number" && j.usage.total_tokens > 0) {
                totalTokens = j.usage.total_tokens;
              }
              const delta = j.choices?.[0]?.delta;
              if (!delta) continue;
              if (typeof delta.content === "string" && delta.content) {
                fullText += delta.content;
                opts.onDelta?.(delta.content);
              }
              mergeToolCallDelta(toolAcc, delta.tool_calls);
            } catch {
              /* ponytail: 跳过坏 SSE 行 */
            }
          }
        });
        res.on("end", () => {
          if (!settled) {
            settled = true;
            resolve({ text: fullText, toolAcc, totalTokens });
          }
        });
      },
    );
    opts.onAbortRegister?.(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        resolve({ text: fullText, toolAcc, totalTokens });
      }
    });
    req.on("error", reject);
    req.setTimeout(120_000, () => {
      req.destroy();
      reject(new Error("stream_timeout"));
    });
    req.write(payload);
    req.end();
  });
}

export async function chatWithToolsStreamOpenAi(
  url: string,
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  uiCtx: UiInferContext,
  opts: {
    model: string;
    pageCtx?: AssistantPageCtx;
    onDelta?: (delta: string) => void;
    isAborted?: () => boolean;
    onAbortRegister?: (fn: () => void) => void;
  },
): Promise<{
  ok: boolean;
  text?: string;
  toolCalls?: AssistantAction[];
  fcMeta?: FcRoundMeta;
  reason?: string;
  error?: string;
}> {
  if (opts.isAborted?.()) {
    return { ok: false, reason: "cancelled" };
  }
  try {
    const req = buildOpenAiFcRequest(messages, uiCtx, {
      model: opts.model,
      max_tokens: resolveMaxOutputTokens(opts.model),
      pageCtx: opts.pageCtx,
    });
    const { text, toolAcc, totalTokens } = await postOpenAiFcStream(
      url,
      apiKey,
      {
        model: req.model,
        messages: req.messages,
        tools: req.tools,
        tool_choice: req.tool_choice,
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        stream_options: { include_usage: true },
      },
      {
        onDelta: opts.onDelta,
        isAborted: opts.isAborted,
        onAbortRegister: opts.onAbortRegister,
      },
    );
    recordTokenSpend(totalTokens);
    const { actions, fc } = toolCallsFromAccum(toolAcc);
    return {
      ok: true,
      text: sanitizeLlmOutput(String(text || "").trim()),
      toolCalls: actions.length > 0 ? actions : undefined,
      fcMeta: fc.length > 0 ? { protocol: "openai", toolCalls: fc } : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "cancelled") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "llm_failed", error: msg };
  }
}

export async function chatWithToolsStreamAnthropic(
  url: string,
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  uiCtx: UiInferContext,
  opts: {
    model: string;
    pageCtx?: AssistantPageCtx;
    onDelta?: (delta: string) => void;
    isAborted?: () => boolean;
    onAbortRegister?: (fn: () => void) => void;
  },
): Promise<{
  ok: boolean;
  text?: string;
  toolCalls?: AssistantAction[];
  fcMeta?: FcRoundMeta;
  reason?: string;
  error?: string;
}> {
  if (opts.isAborted?.()) {
    return { ok: false, reason: "cancelled" };
  }
  try {
    const { body } = buildAnthropicFcRequest(messages, uiCtx, {
      model: opts.model,
      max_tokens: resolveMaxOutputTokens(opts.model),
      pageCtx: opts.pageCtx,
    });
    const state = createAnthropicStreamState();
    let totalTokens = 0;
    await postSseStream(
      url,
      {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body,
      (data) => {
        if (data === "[DONE]") return;
        try {
          const event = JSON.parse(data) as {
            type?: string;
            message?: { usage?: { input_tokens?: number } };
            usage?: { output_tokens?: number };
          };
          if (event.type === "message_start") {
            const input = event.message?.usage?.input_tokens;
            if (typeof input === "number" && input > 0) totalTokens += input;
          } else if (event.type === "message_delta") {
            const output = event.usage?.output_tokens;
            if (typeof output === "number" && output > 0) totalTokens += output;
          }
          applyAnthropicStreamEvent(event, state, opts.onDelta);
        } catch {
          /* ponytail: 跳过坏 SSE 行 */
        }
      },
      {
        isAborted: opts.isAborted,
        onAbortRegister: opts.onAbortRegister,
      },
    );
    if (state.currentTool) {
      state.tools.push(state.currentTool);
      state.currentTool = null;
    }
    recordTokenSpend(totalTokens);
    const { actions, fc } = anthropicToolsToFc(state.tools);
    return {
      ok: true,
      text: sanitizeLlmOutput(String(state.fullText || "").trim()),
      toolCalls: actions.length > 0 ? actions : undefined,
      fcMeta:
        fc.length > 0 ? { protocol: "anthropic", toolCalls: fc } : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "cancelled") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "llm_failed", error: msg };
  }
}
