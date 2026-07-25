/**
 * src/ai/shared-llm.ts
 *
 * Pulse 全局共享 LLM 能力 — AI 任务总结、世界杯赛前预测/赛后总结等共用
 * 同一套 provider / model / API Key (state.json ai_sessions_config + safeStorage).
 */

import { sanitizeLlmOutput } from "./sanitize-llm-output";
import { DEFAULT_MODELS } from "./default-models";
import { CloudSummarizer } from "../ai-sessions/provider-cloud";
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

let _http = null;
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
  for (const name of envMap[providerId] || []) {
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
    DEFAULT_MODELS[providerId];
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
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [opts]
 * @returns {Promise<{ ok: boolean, text?: string, reason?: string }>}
 */
export async function chatCompletion(messages: any, opts: any = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: "empty_messages" };
  }
  const resolved = resolveSharedAiConfig();
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  // P71: block 模式预算检查 — 超限直接拦截, 不消耗 token
  const cfg = stateStore.loadTokenBudgetConfig();
  if (cfg.mode === "block" && cfg.dailyLimit > 0) {
    const spend = stateStore.loadTokenSpend();
    if (isOverBudget(spend, todayKey(), cfg.dailyLimit)) {
      return { ok: false, reason: "budget_exceeded" };
    }
  }

  const httpClient = opts.httpClient || _getHttp();
  const summarizer = opts.impl || new CloudSummarizer();
  try {
    const result = await summarizer.summarize({
      messages,
      provider: resolved.providerId,
      model: resolved.model,
      config: resolved.config,
      httpClient,
    });
    // P71: summarize 返回 { content, usage }; 兼容旧 string 返回
    const text = typeof result === "string" ? result : (result && result.content);
    const usage = result && typeof result === "object" ? result.usage : null;
    // P71: 累计 token 消耗 (warn/block 都记, 供 UI 显示 + 后续拦截判断)
    if (usage && typeof usage.total_tokens === "number") {
      try {
        const dayKey = todayKey();
        const spend = stateStore.loadTokenSpend();
        const next = pruneDays(addSpend(spend, dayKey, usage.total_tokens));
        stateStore.saveTokenSpend(next);
      } catch {
        /* 预算统计失败不影响主流程 */
      }
    }
    return {
      ok: true,
      text: sanitizeLlmOutput(String(text || "").trim()),
    };
  } catch (err: any) {
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
};