/**
 * src/ai/chat-with-tools.ts
 *
 * Function Calling 版 LLM 调用（OpenAI 兼容 + Anthropic）.
 */
import { sanitizeLlmOutput } from "./sanitize-llm-output";
import { resolveSharedAiConfig } from "./shared-llm";
import type { AssistantAction } from "./assistant-prompt";
import {
  buildAnthropicFcRequest,
  buildOpenAiFcRequest,
  extractFcPageContext,
} from "./fc-tool-policy";
import type { AssistantPageCtx } from "../shared/assistant-page-tools";
import type { UiInferContext } from "../shared/pulse-href";
import type { FcRoundMeta, FcToolCall } from "./chat-fc-followup";
import { chatWithToolsStreamOpenAi, chatWithToolsStreamAnthropic } from "./chat-fc-stream";

const { HttpClient } = require("../main/http-client.js");
const { PROVIDER_ENDPOINTS, ANTHROPIC_VERSION } = require("../ai-sessions/provider-cloud.js");

// 思考型模型 (MiniMax-M3 等) 的推理 token 也计入 max_tokens，给太小会在
// 正文/工具调用发出前就被 length 截断 (表现为"回了一句开场白就停")。
const FC_MAX_TOKENS = 8192;

let _http: any = null;
function getHttp() {
  if (!_http) _http = new HttpClient({ timeout: 120_000, maxRetries: 1 });
  return _http;
}

function joinUrl(baseUrl: string, path: string): string {
  if (path.startsWith("/v1/") && baseUrl.endsWith("/v1")) {
    return `${baseUrl}${path.slice(3)}`;
  }
  return `${baseUrl}${path}`;
}

function parseOpenAiToolCalls(parsed: any): {
  actions: AssistantAction[];
  fc: FcToolCall[];
} {
  const msg = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message;
  const calls = msg && msg.tool_calls;
  if (!Array.isArray(calls)) return { actions: [], fc: [] };
  const actions: AssistantAction[] = [];
  const fc: FcToolCall[] = [];
  for (const tc of calls) {
    const fn = tc && tc.function;
    if (!fn || typeof fn.name !== "string") continue;
    let params: Record<string, unknown> = {};
    try {
      params = fn.arguments ? JSON.parse(fn.arguments) : {};
    } catch {
      params = {};
    }
    const id = typeof tc.id === "string" ? tc.id : `call_${fc.length}`;
    actions.push({ tool: fn.name, params });
    fc.push({ id, tool: fn.name, params });
  }
  return { actions, fc };
}

function parseAnthropicToolCalls(parsed: any): {
  actions: AssistantAction[];
  fc: FcToolCall[];
} {
  const blocks = parsed && parsed.content;
  if (!Array.isArray(blocks)) return { actions: [], fc: [] };
  const actions: AssistantAction[] = [];
  const fc: FcToolCall[] = [];
  for (const b of blocks) {
    if (!b || b.type !== "tool_use" || typeof b.name !== "string") continue;
    const params = b.input && typeof b.input === "object" ? b.input : {};
    const id = typeof b.id === "string" ? b.id : `toolu_${fc.length}`;
    actions.push({ tool: b.name, params });
    fc.push({ id, tool: b.name, params });
  }
  return { actions, fc };
}

function extractOpenAiText(parsed: any): string {
  const msg = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message;
  return typeof msg?.content === "string" ? msg.content : "";
}

function extractAnthropicText(parsed: any): string {
  const blocks = parsed && parsed.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

export async function chatWithTools(
  messages: Array<{ role: string; content: string }>,
  opts: {
    isAborted?: () => boolean;
    onAbortRegister?: (fn: () => void) => void;
    model?: string;
    uiInferContext?: UiInferContext;
    pageCtx?: AssistantPageCtx;
    onDelta?: (delta: string) => void;
  } = {},
): Promise<{
  ok: boolean;
  text?: string;
  toolCalls?: AssistantAction[];
  fcMeta?: FcRoundMeta;
  reason?: string;
  error?: string;
}> {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: "empty_messages" };
  }
  if (opts.isAborted?.()) {
    return { ok: false, reason: "cancelled" };
  }
  const resolved = resolveSharedAiConfig();
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }

  const providerId = resolved.providerId as string;
  const ep = (PROVIDER_ENDPOINTS as Record<string, any>)[providerId];
  if (!ep) {
    return { ok: false, reason: "unsupported_provider" };
  }

  const baseUrl = (
    (resolved.config && resolved.config.baseUrl) ||
    ep.baseUrl ||
    ""
  ).replace(/\/+$/, "");
  const url = joinUrl(baseUrl, ep.path);
  const apiKey = resolved.config && resolved.config.apiKey;
  const http = getHttp();
  const model = opts.model || resolved.model;
  const uiCtx: UiInferContext = opts.uiInferContext ?? { userText: "" };
  const pageCtx =
    opts.pageCtx ??
    extractFcPageContext(undefined, { activeNav: uiCtx.activeNav });

  try {
    if (ep.protocol === "openai") {
      if (typeof opts.onDelta === "function") {
        const streamed = await chatWithToolsStreamOpenAi(
          url,
          apiKey,
          messages,
          uiCtx,
          {
            model,
            pageCtx,
            onDelta: opts.onDelta,
            isAborted: opts.isAborted,
            onAbortRegister: opts.onAbortRegister,
          },
        );
        if (streamed.ok) return streamed;
        if (streamed.reason === "cancelled") return streamed;
        /* ponytail: 流式 FC 失败则降级非流式 */
      }
      const req = buildOpenAiFcRequest(messages, uiCtx, {
        model,
        max_tokens: FC_MAX_TOKENS,
        pageCtx,
      });
      const r = await http.post(
        url,
        {
          model: req.model,
          messages: req.messages,
          tools: req.tools,
          tool_choice: req.tool_choice,
          temperature: req.temperature,
          max_tokens: req.max_tokens,
        },
        { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      );
      if (r.error || r.status < 200 || r.status >= 300) {
        return { ok: false, reason: "llm_failed", error: r.error || `http_${r.status}` };
      }
      const parsed = JSON.parse(r.body || "{}");
      const { actions, fc } = parseOpenAiToolCalls(parsed);
      const text = sanitizeLlmOutput(extractOpenAiText(parsed));
      return {
        ok: true,
        text,
        toolCalls: actions.length > 0 ? actions : undefined,
        fcMeta:
          fc.length > 0
            ? { protocol: "openai", toolCalls: fc }
            : undefined,
      };
    }

    if (ep.protocol === "anthropic") {
      if (typeof opts.onDelta === "function") {
        const streamed = await chatWithToolsStreamAnthropic(
          url,
          apiKey,
          messages,
          uiCtx,
          {
            model,
            pageCtx,
            onDelta: opts.onDelta,
            isAborted: opts.isAborted,
            onAbortRegister: opts.onAbortRegister,
          },
        );
        if (streamed.ok) return streamed;
        if (streamed.reason === "cancelled") return streamed;
      }
      const { body } = buildAnthropicFcRequest(messages, uiCtx, {
        model,
        max_tokens: FC_MAX_TOKENS,
        pageCtx,
      });
      const r = await http.post(
        url,
        body,
        {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
      );
      if (r.error || r.status < 200 || r.status >= 300) {
        return { ok: false, reason: "llm_failed", error: r.error || `http_${r.status}` };
      }
      const parsed = JSON.parse(r.body || "{}");
      const { actions, fc } = parseAnthropicToolCalls(parsed);
      const text = sanitizeLlmOutput(extractAnthropicText(parsed));
      return {
        ok: true,
        text,
        toolCalls: actions.length > 0 ? actions : undefined,
        fcMeta:
          fc.length > 0
            ? { protocol: "anthropic", toolCalls: fc }
            : undefined,
      };
    }

    return { ok: false, reason: "unsupported_provider" };
  } catch (err: any) {
    return {
      ok: false,
      reason: "llm_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

module.exports = { chatWithTools };
