/**
 * src/ai/chat-stream.ts
 *
 * LLM SSE 流式 completion（OpenAI 兼容 + Anthropic）.
 * ponytail: 未知 provider 回退非流式 chatCompletion.
 */
import { sanitizeLlmOutput } from "./sanitize-llm-output";
import {
  resolveSharedAiConfig,
  chatCompletion,
  isBudgetBlocked,
  recordTokenSpend,
} from "./shared-llm";
import {
  isLlmOpen,
  recordLlmSuccess,
  recordLlmFailure,
} from "./llm-circuit-breaker";
import { resolveMaxOutputTokens } from "./default-models";
import { recordLlmOutcome } from "./llm-telemetry";
import {
  PROVIDER_ENDPOINTS,
  ANTHROPIC_VERSION,
} from "../ai-sessions/provider-cloud";

const https = require("node:https");
const { URL } = require("node:url");

function joinUrl(baseUrl: string, path: string): string {
  if (path.startsWith("/v1/") && baseUrl.endsWith("/v1")) {
    return `${baseUrl}${path.slice(3)}`;
  }
  return `${baseUrl}${path}`;
}

function extractOpenAiDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  try {
    const j = JSON.parse(data);
    const delta =
      j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
    return typeof delta === "string" ? delta : null;
  } catch {
    return null;
  }
}

function extractAnthropicTextDelta(dataLine: string): string | null {
  const trimmed = dataLine.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data) return null;
  try {
    const j = JSON.parse(data);
    if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta") {
      return typeof j.delta.text === "string" ? j.delta.text : null;
    }
    return null;
  } catch {
    return null;
  }
}

function extractOpenAiStreamUsage(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  try {
    const j = JSON.parse(data);
    const t = j.usage && j.usage.total_tokens;
    return typeof t === "number" && t > 0 ? t : null;
  } catch {
    return null;
  }
}

function extractAnthropicStreamUsage(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data) return null;
  try {
    const j = JSON.parse(data);
    if (j.type === "message_start") {
      const t = j.message && j.message.usage && j.message.usage.input_tokens;
      return typeof t === "number" && t > 0 ? t : null;
    }
    if (j.type === "message_delta") {
      const t = j.usage && j.usage.output_tokens;
      return typeof t === "number" && t > 0 ? t : null;
    }
    return null;
  } catch {
    return null;
  }
}

function postStream(
  url: string,
  headers: Record<string, string>,
  body: object,
  onDelta: (t: string) => void,
  parseLine: (line: string) => string | null,
  opts: {
    isAborted?: () => boolean;
    onAbortRegister?: (fn: () => void) => void;
    parseUsage?: (line: string) => number | null;
  } = {},
): Promise<{ text: string; totalTokens: number }> {
  return new Promise((resolve, reject) => {
    if (opts.isAborted?.()) {
      reject(new Error("cancelled"));
      return;
    }
    const payload = JSON.stringify(body);
    const u = new URL(url);
    let fullText = "";
    let sseBuf = "";
    let settled = false;
    let totalTokens = 0;

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
      (res: any) => {
        // 非 2xx 时 body 是 JSON 错误而不是 SSE — 不检查会把 400 当成
        // "0 个 delta 的成功流"，上层拿到 ok:true + 空文本。
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errBody = "";
          res.on("data", (chunk: Buffer) => {
            if (errBody.length < 2048) errBody += chunk.toString("utf8");
          });
          res.on("end", () => {
            if (!settled) {
              settled = true;
              reject(
                new Error(
                  `stream_http_${res.statusCode}${errBody ? `: ${errBody.trim().slice(0, 512)}` : ""}`,
                ),
              );
            }
          });
          res.on("error", () => {
            if (!settled) {
              settled = true;
              reject(new Error(`stream_http_${res.statusCode}`));
            }
          });
          return;
        }
        res.on("data", (chunk: Buffer) => {
          if (opts.isAborted?.()) {
            if (!settled) {
              settled = true;
              req.destroy();
              resolve({ text: fullText, totalTokens });
            }
            return;
          }
          sseBuf += chunk.toString("utf8");
          const lines = sseBuf.split("\n");
          sseBuf = lines.pop() || "";
          for (const line of lines) {
            const delta = parseLine(line);
            if (delta) {
              fullText += delta;
              onDelta(delta);
            }
            if (opts.parseUsage) {
              const t = opts.parseUsage(line);
              if (typeof t === "number" && t > 0) totalTokens += t;
            }
          }
        });
        res.on("end", () => {
          if (sseBuf) {
            const delta = parseLine(sseBuf);
            if (delta) {
              fullText += delta;
              onDelta(delta);
            }
            if (opts.parseUsage) {
              const t = opts.parseUsage(sseBuf);
              if (typeof t === "number" && t > 0) totalTokens += t;
            }
          }
          resolve({ text: fullText, totalTokens });
        });
      },
    );
    opts.onAbortRegister?.(() => {
      if (!settled) {
        settled = true;
        req.destroy();
        resolve({ text: fullText, totalTokens });
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

export async function chatCompletionStream(
  messages: any[],
  opts: {
    onDelta?: (delta: string) => void;
    isAborted?: () => boolean;
    onAbortRegister?: (fn: () => void) => void;
    model?: string;
  } = {},
) {
  const t0 = Date.now();
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
  if (isBudgetBlocked()) {
    return { ok: false, reason: "budget_exceeded" };
  }

  if (typeof opts.onDelta !== "function") {
    return chatCompletion(messages, { model: opts.model });
  }

  const providerId = resolved.providerId as string;
  const model = opts.model || resolved.model;
  const ep = (PROVIDER_ENDPOINTS as Record<string, any>)[providerId];
  if (!ep) {
    return chatCompletion(messages, { model: opts.model });
  }
  if (isLlmOpen(providerId)) {
    return { ok: false, reason: "circuit_open" };
  }

  const baseUrl = (
    (resolved.config && resolved.config.baseUrl) ||
    ep.baseUrl ||
    ""
  ).replace(/\/+$/, "");
  const url = joinUrl(baseUrl, ep.path);
  const apiKey = resolved.config && resolved.config.apiKey;

  try {
    if (ep.protocol === "openai") {
      const { text, totalTokens } = await postStream(
        url,
        { Authorization: `Bearer ${apiKey}` },
        {
          model,
          messages,
          stream: true,
          temperature: 0.3,
          max_tokens: resolveMaxOutputTokens(model),
          stream_options: { include_usage: true },
        },
        opts.onDelta,
        extractOpenAiDelta,
        { ...opts, parseUsage: extractOpenAiStreamUsage },
      );
      recordTokenSpend(totalTokens);
      recordLlmSuccess(providerId);
      recordLlmOutcome({ t0, providerId, model, ok: true, reason: "ok", totalTokens });
      return { ok: true, text: sanitizeLlmOutput(String(text || "").trim()) };
    }

    if (ep.protocol === "anthropic") {
      const systemMsgs = messages.filter((m: any) => m.role === "system");
      const chatMsgs = messages.filter((m: any) => m.role !== "system");
      const body: Record<string, unknown> = {
        model,
        max_tokens: resolveMaxOutputTokens(model),
        temperature: 0.3,
        stream: true,
        messages: chatMsgs,
      };
      if (systemMsgs.length > 0) {
        body.system = systemMsgs.map((m: any) => m.content).join("\n\n");
      }
      const { text, totalTokens } = await postStream(
        url,
        {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body,
        opts.onDelta,
        extractAnthropicTextDelta,
        { ...opts, parseUsage: extractAnthropicStreamUsage },
      );
      recordTokenSpend(totalTokens);
      recordLlmSuccess(providerId);
      recordLlmOutcome({ t0, providerId, model, ok: true, reason: "ok", totalTokens });
      return { ok: true, text: sanitizeLlmOutput(String(text || "").trim()) };
    }

    return chatCompletion(messages, { model: opts.model });
  } catch (err: any) {
    recordLlmFailure(providerId);
    recordLlmOutcome({ t0, providerId, model, ok: false, reason: "llm_failed" });
    return {
      ok: false,
      reason: "llm_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

module.exports = { chatCompletionStream };
