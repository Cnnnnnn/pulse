/**
 * src/ai/shared-llm.ts
 *
 * Pulse 全局共享 LLM 能力 — AI 任务总结、世界杯赛前预测/赛后总结等共用
 * 同一套 provider / model / API Key (state.json ai_sessions_config + safeStorage).
 */

import { sanitizeLlmOutput } from "./sanitize-llm-output";
import { DEFAULT_MODELS } from "./default-models";
import { CloudSummarizer } from "../ai-sessions/provider-cloud";
import {
  isLlmOpen,
  recordLlmSuccess,
  recordLlmFailure,
} from "./llm-circuit-breaker";
import { recordLlmCall } from "./llm-telemetry";
// ponytail: main/{http-client,state-store,token-budget}.js 是 Phase 3 5 例外 (CJS
// module.exports, 7a-6 才 ESM-ify). 保留 require() 让 TS 把 module 整体当 any,
// 跑通 ESM-import 不到的 CJS 模块. 等 7a-6 完成再换成 named import.
const { HttpClient } = require("../main/http-client.js") as any;
const stateStore: any = require("../main/state-store.js");
const {
  isOverBudget,
  todayKey,
  addSpend,
  pruneDays,
} = require("../main/token-budget.js") as any;

export const SUPPORTED_PROVIDERS = ["openai", "anthropic", "deepseek", "minimax"];

let _http: any = null;
function _getHttp() {
  if (!_http) _http = new HttpClient({ timeout: 120_000, maxRetries: 1 });
  return _http;
}

function _loadApiKey(providerId: any) {
  try {
    const storage = require("../ai-sessions/storage.js");
    const fromStore = storage.loadApiKey(providerId);
    if (fromStore) return fromStore;
  } catch {
    /* noop */
  }
  const envMap = {
    openai: ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    deepseek: ["DEEPSEEK_API_KEY"],
    minimax: ["MINIMAX_API_KEY", "MINIMAX_KEY"],
  };
  for (const name of (envMap as any)[providerId] || []) {
    const v = process.env[name];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/**
 * 读取当前共享 AI 配置 (不返回 apiKey).
 * @returns {{ ok: boolean, reason?: string, providerId?: string, model?: string, config?: object }}
 */
export function resolveSharedAiConfig() {
  const cfg = stateStore.loadAISessionsConfig();
  if (!cfg || typeof cfg !== "object") {
    return { ok: false, reason: "config_missing" };
  }
  const providerId = cfg.provider || (cfg.cloud && cfg.cloud.providerId);
  if (!providerId || !SUPPORTED_PROVIDERS.includes(providerId)) {
    return { ok: false, reason: "unsupported_provider" };
  }
  const cloud = cfg.cloud || {};
  const model =
    (typeof cloud.model === "string" && cloud.model) ||
    (DEFAULT_MODELS as any)[providerId];
  if (!model) {
    return { ok: false, reason: "model_missing" };
  }
  const apiKey = _loadApiKey(providerId);
  if (!apiKey) {
    return { ok: false, reason: "api_key_missing" };
  }
  return {
    ok: true,
    providerId,
    model,
    config: {
      providerId,
      model,
      apiKey,
      baseUrl: typeof cloud.baseUrl === "string" ? cloud.baseUrl : undefined,
    },
  };
}

/**
 * token 预算前置拦截 (block 模式) — 超限时不消耗 token.
 * 共享 / 流式 / FC 各路径统一走这里, 避免 FC 路径绕过预算.
 */
export function isBudgetBlocked(): boolean {
  try {
    const cfg = stateStore.loadTokenBudgetConfig();
    if (cfg && cfg.mode === "block" && cfg.dailyLimit > 0) {
      const spend = stateStore.loadTokenSpend();
      return isOverBudget(spend, todayKey(), cfg.dailyLimit);
    }
  } catch {
    /* 读预算失败不拦截 */
  }
  return false;
}

/**
 * 归一各协议响应里的 token usage 总数.
 * - openai 兼容: usage.total_tokens
 * - anthropic: usage.input_tokens + usage.output_tokens
 * @returns number | null (拿不到时 null, 由调用方静默跳过)
 */
export function extractUsageTotalTokens(parsed: any, protocol: string): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  const usage = parsed.usage;
  if (!usage || typeof usage !== "object") return null;
  if (protocol === "anthropic") {
    const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
    const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
    if (input <= 0 && output <= 0) return null;
    return input + output;
  }
  const total = usage.total_tokens;
  return typeof total === "number" && total > 0 ? total : null;
}

/**
 * 统一 token 记账出口 — 共享 / 流式 / FC 各成功路径都累计每日用量.
 * 失败静默 (预算统计不影响主流程).
 */
export function recordTokenSpend(totalTokens: unknown): void {
  if (typeof totalTokens !== "number" || !Number.isFinite(totalTokens) || totalTokens <= 0) {
    return;
  }
  try {
    const dayKey = todayKey();
    const spend = stateStore.loadTokenSpend();
    const next = pruneDays(addSpend(spend, dayKey, totalTokens));
    stateStore.saveTokenSpend(next);
  } catch {
    /* 预算统计失败不影响主流程 */
  }
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [opts]
 * @returns {Promise<{ ok: boolean, text?: string, reason?: string }>}
 */
export async function chatCompletion(messages: any, opts: any = {}) {
  const t0 = Date.now();
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: "empty_messages" };
  }
  const resolved = resolveSharedAiConfig();
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  // P71: block 模式预算检查 — 超限直接拦截, 不消耗 token
  if (isBudgetBlocked()) {
    return { ok: false, reason: "budget_exceeded" };
  }
  // P1-5: provider 熔断 — open 时短路, 不打 provider
  if (isLlmOpen(resolved.providerId as string)) {
    return { ok: false, reason: "circuit_open" };
  }

  const httpClient = opts.httpClient || _getHttp();
  const summarizer = opts.impl || new CloudSummarizer();
  const model = opts.model || resolved.model;
  try {
    const result = await summarizer.summarize({
      messages,
      provider: resolved.providerId,
      model,
      config: resolved.config,
      httpClient,
    });
    // P71: summarize 返回 { content, usage }; 兼容旧 string 返回
    const text = typeof result === "string" ? result : (result && result.content);
    const usage = result && typeof result === "object" ? result.usage : null;
    // P71: 累计 token 消耗 (warn/block 都记, 供 UI 显示 + 后续拦截判断)
    recordTokenSpend(usage && usage.total_tokens);
    recordLlmSuccess(resolved.providerId as string);
    // P2-10: 埋点 (延迟/成本/结果归因)
    recordLlmCall({
      ts: t0,
      providerId: resolved.providerId as string,
      model: model as string,
      latencyMs: Date.now() - t0,
      totalTokens:
        usage && typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
      reason: "ok",
      ok: true,
    });
    return {
      ok: true,
      text: sanitizeLlmOutput(String(text || "").trim()),
    };
  } catch (err: any) {
    recordLlmFailure(resolved.providerId as string);
    recordLlmCall({
      ts: t0,
      providerId: resolved.providerId as string,
      model: model as string,
      latencyMs: Date.now() - t0,
      reason: "llm_failed",
      ok: false,
    });
    return { ok: false, reason: "llm_failed", error: err && err.message };
  }
}

// ponytail: Phase 7 7a 保留 module.exports, 给 CJS 测试 + shim 调用方用.
// dist-test/.cjs 编译时 esbuild 自动改写 __export 互操作, 但 module.exports = {…}
// 显式列出可写属性, 测试 `sharedLlm.chatCompletion = mockFn` 能直接改. 7b
// 删 shim 阶段再去掉 module.exports (此时测试必须改 vi.mock).
module.exports = {
  SUPPORTED_PROVIDERS,
  resolveSharedAiConfig,
  chatCompletion,
  isBudgetBlocked,
  extractUsageTotalTokens,
  recordTokenSpend,
};