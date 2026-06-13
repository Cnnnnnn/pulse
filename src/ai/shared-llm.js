/**
 * src/ai/shared-llm.js
 *
 * Pulse 全局共享 LLM 能力 — AI 任务总结、世界杯赛前预测/赛后总结等共用
 * 同一套 provider / model / API Key (state.json ai_sessions_config + safeStorage).
 */

const { CloudSummarizer } = require("../ai-sessions/provider-cloud");
const { HttpClient } = require("../main/http-client");
const stateStore = require("../main/state-store");
const { sanitizeLlmOutput } = require("./sanitize-llm-output");

const SUPPORTED_PROVIDERS = ["openai", "anthropic", "deepseek", "minimax"];

const { DEFAULT_MODELS } = require("./default-models");

let _http = null;
function _getHttp() {
  if (!_http) _http = new HttpClient({ timeout: 120_000, maxRetries: 1 });
  return _http;
}

function _loadApiKey(providerId) {
  try {
    const storage = require("../ai-sessions/storage");
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
function resolveSharedAiConfig() {
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
async function chatCompletion(messages, opts = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: "empty_messages" };
  }
  const resolved = resolveSharedAiConfig();
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  const httpClient = opts.httpClient || _getHttp();
  const summarizer = opts.impl || new CloudSummarizer();
  try {
    const text = await summarizer.summarize({
      messages,
      provider: resolved.providerId,
      model: resolved.model,
      config: resolved.config,
      httpClient,
    });
    return {
      ok: true,
      text: sanitizeLlmOutput(String(text || "").trim()),
    };
  } catch (err) {
    return { ok: false, reason: "llm_failed", error: err && err.message };
  }
}

module.exports = {
  SUPPORTED_PROVIDERS,
  DEFAULT_MODELS,
  resolveSharedAiConfig,
  chatCompletion,
};
