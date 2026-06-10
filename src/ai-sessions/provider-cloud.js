/**
 * src/ai-sessions/provider-cloud.js
 *
 * Phase B6b (AI Sessions Daily Digest): 云端 LLM provider impl.
 *
 *跟 spec §4.4 "Provider2/3/4/5" 一致:
 * -4 个 providerId路由:
 * - openai → POST https://api.openai.com/v1/chat/completions (OpenAI兼容)
 * - anthropic → POST https://api.anthropic.com/v1/messages (anthropic-version header)
 * - deepseek → POST https://api.deepseek.com/v1/chat/completions (OpenAI兼容)
 * - minimax → POST https://api.minimax.chat/v1/chat/completions (OpenAI兼容)
 * - auth:
 * - OpenAI兼容: Authorization: Bearer <key>
 * - Anthropic: x-api-key: <key> + anthropic-version:2023-06-01
 * - healthcheck:走轻量 POST /chat/completions with max_tokens=1
 *200/201 = ok,401/403 = auth fail,其它4xx/5xx = error
 * - timeout120s, retry1 次 (走 httpClient 自带 retry)
 *
 *接入 LLMSummarizer:
 * - impl.healthcheck({ provider, model, config, httpClient })
 * - impl.summarize({ messages, provider, model, config, httpClient, meta })
 *
 * config形态:
 * {
 * providerId: 'openai' | 'anthropic' | 'deepseek' | 'minimax',
 * model: string, // 必须显式提供 (云端不猜)
 * apiKey: string, // DI注入 (wiring 从 safeStorage拿)
 * baseUrl?: string, // 可选覆盖 (默认 endpoint root)
 * }
 *
 * URL拼接规则:
 * - baseUrl 是 "root" (无 /v1),path总是 /v1/...
 * - user传 baseUrl 含 /v1 也 OK (避免 .../v1/v1/...)
 * - baseUrl trailing slash 自动 strip
 *
 * CommonJS,跟 src/config/ 一致.
 */

const DEFAULT_TIMEOUT_MS =120_000; //跟 ollama 一致

// Provider 路由表. baseUrl 是 "root", path 总是 /v1/...
// Phase B7e.3 (2026-06): 端点更新到 2026 最新.
//   - DeepSeek: deepseek-chat = DeepSeek-V3.1 (128K context, 默认非思考模式).
//     也支持 deepseek-reasoner = 思考模式 (用户可手动改 model 字段切换).
//     Base URL 不变 (api.deepseek.com).
//   - MiniMax: 用 M2.7 (mini-site 最新, OpenAI 兼容).
//     Base URL 改成新版 minimaxi.com (旧 minimax.chat 也仍兼容, 但官方推荐新域名).
//     path 仍是 /v1/chat/completions (OpenAI 兼容格式; /v1/text/chatcompletion_v2 是
//     MiniMax 私有格式, 不走 OpenAI 解析路径, 这里不接).
const PROVIDER_ENDPOINTS = {
  openai: { baseUrl: 'https://api.openai.com', protocol: 'openai', path: '/v1/chat/completions' },
  anthropic: { baseUrl: 'https://api.anthropic.com', protocol: 'anthropic', path: '/v1/messages' },
  // DeepSeek: 官方推荐 deepseek-chat (= V3.1 非思考), 备 deepseek-reasoner
  deepseek: { baseUrl: 'https://api.deepseek.com', protocol: 'openai', path: '/v1/chat/completions' },
  // MiniMax: M3 (用户指定 2026 最新); minimaxi.com/v1 — _joinUrl 会剥 path /v1 避免重复.
  minimax: { baseUrl: 'https://api.minimaxi.com/v1', protocol: 'openai', path: '/v1/chat/completions' },
};

const ANTHROPIC_VERSION = '2023-06-01';

function _resolveProvider(providerId) {
 const cfg = PROVIDER_ENDPOINTS[providerId];
 if (!cfg) {
 throw new TypeError(`CloudSummarizer: unsupported providerId '${providerId}'. Allowed: openai|anthropic|deepseek|minimax`);
 }
 return cfg;
}

function _resolveBaseUrl(providerId, config) {
 const ep = _resolveProvider(providerId);
 const u = (config && typeof config.baseUrl === 'string' && config.baseUrl.length >0)
 ? config.baseUrl
 : ep.baseUrl;
 return u.replace(/\/+$/, '');
}

/**
 * user传 baseUrl 时, 可能含 /v1 也可能不含 /v1. path 总以 /v1/开头.
 *避免拼成 ".../v1/v1/..." 这种重复.
 */
function _joinUrl(baseUrl, path) {
 if (path.startsWith('/v1/') && baseUrl.endsWith('/v1')) {
 return `${baseUrl}${path.slice(3)}`; //剥 path 的 /v1
 }
 return `${baseUrl}${path}`;
}

function _resolveModel(config) {
 const m = config && typeof config.model === 'string' ? config.model : '';
 if (!m) throw new TypeError('CloudSummarizer: config.model must be non-empty string');
 return m;
}

function _resolveApiKey(config) {
 const k = config && typeof config.apiKey === 'string' ? config.apiKey : '';
 if (!k) throw new TypeError('CloudSummarizer: config.apiKey must be non-empty string (caller must load from safeStorage)');
 return k;
}

/**
 * healthcheck 用: 用户配错应该 graceful返 ok:false 而不是 throw. summarize 里才 throw.
 */
function _tryResolveModel(config) {
 try { return _resolveModel(config); } catch { return null; }
}
function _tryResolveApiKey(config) {
 try { return _resolveApiKey(config); } catch { return null; }
}

class CloudSummarizer {
 /**
 * 健康检查:走轻量 POST /chat/completions with max_tokens=1.
 *200/201 = ok,401/403 = auth fail,其它4xx/5xx = error.
 *
 * @param {object} opts
 * @param {string} opts.provider 'openai' | 'anthropic' | 'deepseek' | 'minimax'
 * @param {string} opts.model
 * @param {object} opts.config { providerId, model, apiKey, baseUrl? }
 * @param {object} opts.httpClient
 * @returns {Promise<{ok: boolean, error?: string, latencyMs?: number, status?: number}>}
 */
 async healthcheck({ provider, model, config, httpClient } = {}) {
 if (!httpClient) return { ok: false, error: 'httpClient not provided' };
 const providerId = config && config.providerId;
 if (!providerId) return { ok: false, error: 'config.providerId required' };
 const apiKey = _tryResolveApiKey(config);
 if (!apiKey) return { ok: false, error: 'config.apiKey required' };
 let ep;
 try { ep = _resolveProvider(providerId); } catch (err) { return { ok: false, error: err.message }; }
 const baseUrl = _resolveBaseUrl(providerId, config);
 const modelName = _tryResolveModel(config);
 if (!modelName) return { ok: false, error: 'config.model required' };
 const url = _joinUrl(baseUrl, ep.path);

 const t0 = Date.now();
 let r;
 try {
 if (ep.protocol === 'openai') {
 const body = {
 model: modelName,
 messages: [{ role: 'user', content: 'ping' }],
 max_tokens:1,
 stream: false,
 };
 r = await httpClient.post(
 url,
 body,
 { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
 { timeout:10_000 }
 );
 } else {
 const body = {
 model: modelName,
 messages: [{ role: 'user', content: 'ping' }],
 max_tokens:1,
 };
 r = await httpClient.post(
 url,
 body,
 {
 'Content-Type': 'application/json',
 'x-api-key': apiKey,
 'anthropic-version': ANTHROPIC_VERSION,
 },
 { timeout:10_000 }
 );
 }
 } catch (err) {
 return { ok: false, error: (err && err.message) || 'unknown', latencyMs: Date.now() - t0 };
 }

 const latencyMs = Date.now() - t0;
 if (r.error) return { ok: false, error: r.error, latencyMs, status: r.status };
 if (r.status >=200 && r.status <300) return { ok: true, latencyMs, status: r.status };
 if (r.status ===401 || r.status ===403) {
 return { ok: false, error: `auth_${r.status}`, latencyMs, status: r.status };
 }
 return { ok: false, error: `http_status_${r.status}`, latencyMs, status: r.status };
 }

 /**
 *调 cloud LLM 出 daily digest markdown.
 *
 * @param {object} opts
 * @param {Array<{role: string, content: string}>} opts.messages
 * @param {string} opts.provider
 * @param {string} opts.model
 * @param {object} opts.config { providerId, model, apiKey, baseUrl? }
 * @param {object} opts.httpClient
 * @param {object} [opts.meta]  透传 (dateKey / locale / sessionCount)
 * @returns {Promise<string>} markdown summary
 */
 async summarize({ messages, provider, model, config, httpClient, meta } = {}) {
 if (!httpClient) throw new TypeError('CloudSummarizer.summarize: httpClient not provided');
 if (!Array.isArray(messages) || messages.length ===0) {
 throw new TypeError('CloudSummarizer.summarize: messages must be non-empty array');
 }
 const providerId = config && config.providerId;
 if (!providerId) throw new TypeError('CloudSummarizer.summarize: config.providerId required');
 if (typeof model !== 'string' || model.length ===0) {
 throw new TypeError('CloudSummarizer.summarize: model must be non-empty string');
 }
 const apiKey = _resolveApiKey(config);
 const ep = _resolveProvider(providerId);
 const baseUrl = _resolveBaseUrl(providerId, config);
 const url = _joinUrl(baseUrl, ep.path);

 let r;
 if (ep.protocol === 'openai') {
 const body = {
 model,
 messages,
 stream: false,
 temperature:0.3,
 max_tokens:2048,
 };
 r = await httpClient.post(
 url,
 body,
 { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
 { timeout: DEFAULT_TIMEOUT_MS }
 );
 } else {
 // Anthropic: system message拆出, messages数组只剩 user/assistant
 const systemMsgs = messages.filter((m) => m && m.role === 'system');
 const chatMsgs = messages.filter((m) => m && m.role !== 'system');
 const body = {
 model,
 messages: chatMsgs,
 max_tokens:2048,
 temperature:0.3,
 };
 if (systemMsgs.length >0) {
 body.system = systemMsgs.map((m) => m.content).join('\n\n');
 }
 r = await httpClient.post(
 url,
 body,
 {
 'Content-Type': 'application/json',
 'x-api-key': apiKey,
 'anthropic-version': ANTHROPIC_VERSION,
 },
 { timeout: DEFAULT_TIMEOUT_MS }
 );
 }

 if (r.error) {
 throw new Error(`cloud_summarize: ${r.error} (provider=${providerId} status=${r.status || 'no_status'})`);
 }
 if (r.status ===401 || r.status ===403) {
 throw new Error(`cloud_summarize: auth_${r.status} (provider=${providerId} — check API key)`);
 }
 if (r.status <200 || r.status >=300) {
 throw new Error(`cloud_summarize: http_status_${r.status} body=${(r.body || '').slice(0,200)}`);
 }
 let parsed;
 try {
 parsed = JSON.parse(r.body);
 } catch (err) {
 throw new Error(`cloud_summarize: response not JSON: ${err.message}; body=${(r.body || '').slice(0,200)}`);
 }

 let content = null;
 if (ep.protocol === 'openai') {
 // OpenAI兼容: choices[0].message.content
 content = parsed && parsed.choices && parsed.choices[0]
 && parsed.choices[0].message
 && typeof parsed.choices[0].message.content === 'string'
 ? parsed.choices[0].message.content
 : null;
 } else {
 // Anthropic: content[0].text
 const blocks = parsed && parsed.content;
 if (Array.isArray(blocks) && blocks.length >0 && typeof blocks[0].text === 'string') {
 content = blocks[0].text;
 }
 }
 if (content == null) {
 throw new Error(`cloud_summarize: missing content in response (provider=${providerId}); body=${(r.body || '').slice(0,200)}`);
 }
 return content;
 }
}

module.exports = {
 CloudSummarizer,
 PROVIDER_ENDPOINTS,
 ANTHROPIC_VERSION,
 DEFAULT_TIMEOUT_MS,
};
