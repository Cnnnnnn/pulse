/**
 * src/ai-sessions/wiring.js
 *
 * Phase B4 + B6b.5 (AI Sessions Daily Digest): main进程 wiring.
 *
 * 把 B1 (抽象) + B2 (CursorDetector) + B3 (OllamaSummarizer) +
 * B6 (CloudSummarizer)拼成可跑的 DailyDigestRunner,暴露给 main/index.js bootstrap 用.
 *
 * cfg.provider路由:
 * - 'ollama' → OllamaSummarizer (host: cfg.ollama.host, model: cfg.ollama.model)
 * - 'openai' | 'anthropic' | 'deepseek' | 'minimax'
 * → CloudSummarizer (apiKey: storage.loadApiKey(providerId))
 * -其它 / apiKey拿不到 →走 fallback no-op summarizer (healthcheck ok:false)
 *
 *抽出来便于单测 (不污染 main/index.js启动流程),跟 storage wrapper
 *一起 make出来.单元测: tests/ai-sessions/wiring.test.js
 *
 * CommonJS,跟 src/config/ 一致.
 */

const { AISessionDetector } = require('./detector');
const { CursorDetectorImpl } = require('./cursor');
const { LLMSummarizer } = require('./summarizer');
const { OllamaSummarizer } = require('./provider-ollama');
const { CloudSummarizer, PROVIDER_ENDPOINTS } = require('./provider-cloud');
const { DailyDigestRunner, DEFAULT_BACKFILL_DAYS, BACKFILL_SLEEP_MS } = require('./digest');
const { HttpClient } = require('../main/http-client');
const stateStore = require('../main/state-store');

const SUPPORTED_PROVIDERS = ['ollama', ...Object.keys(PROVIDER_ENDPOINTS)];

/**
 *合并 cfg (config.json sanitize 后) + runtimeOverride (state.json ai_sessions_config).
 * runtimeOverride字段优先 (用户在 Settings modal里改的).
 *字段集: enabled / provider / ollama / cloud / backfillDays / locale
 *
 * @param {object} cfg
 * @param {object|null} override
 * @returns {object}
 */
function mergeAISessionsConfig(cfg, override) {
 const base = cfg || { enabled: false, provider: 'ollama', ollama: {}, cloud: null };
 if (!override || typeof override !== 'object') return base;
 const out = { ...base };
 if ('enabled' in override && typeof override.enabled === 'boolean') out.enabled = override.enabled;
 if ('provider' in override && typeof override.provider === 'string') out.provider = override.provider;
 if (override.ollama && typeof override.ollama === 'object') {
 out.ollama = { ...(base.ollama || {}), ...override.ollama };
 }
 if (override.cloud && typeof override.cloud === 'object') {
 out.cloud = { ...(base.cloud || {}), ...override.cloud };
 }
 if (typeof override.backfillDays === 'number') out.backfillDays = override.backfillDays;
 if (typeof override.locale === 'string') out.locale = override.locale;
 return out;
}

/**
 * 把 state-store 的 loadDailyDigests / hasDailyDigest / saveDailyDigest
 *包装成 DailyDigestRunner期望的 storage 接口.
 *
 * @param {string} [statePath] 注入便于测试
 * @returns {{ loadDigests, hasDigest, saveDigest }}
 */
function makeStateStoreStorage(statePath) {
 return {
 loadDigests: () => stateStore.loadDailyDigests(statePath),
 hasDigest: (dateKey) => stateStore.hasDailyDigest(dateKey, statePath),
 saveDigest: (digest) => stateStore.saveDailyDigest(digest, statePath),
 };
}

/**
 * 从 safeStorage拿 API key. DI注入便于测试 (mock safeStorage).
 * 没 safeStorage 或 loadApiKey返 null →返 null (caller 用 fallback summarizer).
 *
 * @param {string} providerId
 * @returns {string|null}
 */
function _defaultResolveApiKey(providerId) {
 try {
 const storage = require('./storage');
 return storage.loadApiKey(providerId);
 } catch {
 return null;
 }
}

/**
 * Build a "no api key" stub summarizer. healthcheck永远 ok:false,
 * summarize永远 throw. wiring不挂,digest运行时 healthcheck fail → skip.
 *
 *返 LLMSummarizer instance (不是裸 impl),因为 DailyDigestRunner 要 .summarize().
 */
function _makeStubSummarizer(providerId, reason) {
 return new LLMSummarizer({
 provider: providerId,
 model: 'stub', // LLMSummarizer要非空;真实 model在 healthcheck/summarize报里
 impl: {
 async healthcheck() {
 return { ok: false, error: `stub: ${reason}` };
 },
 async summarize() {
 throw new Error(`cloud_summarize: stub summarizer (no api key): ${reason}`);
 },
 },
 config: {},
 httpClient: null,
 });
}

/**
 * Build a DailyDigestRunner. main进程 bootstrap调一次.
 *
 * @param {object} opts
 * @param {object} opts.config sanitizeConfig()返的 aiSessions 配置块
 * @param {object} [opts.runtimeOverride] state.json ai_sessions_config (用户在 Settings改的,优先)
 * @param {string} [opts.statePath]   注入 state.json路径
 * @param {object} [opts.httpClient]  注入 HttpClient (默认 new)
 * @param {object} [opts.summarizerImpl] 注入 provider impl (默认按 provider 自动选)
 * @param {object} [opts.detectorImpl] 注入 CursorDetectorImpl (默认 new)
 * @param {function} [opts.resolveApiKey] 注入 apiKey resolver (默认 _defaultResolveApiKey)
 * @param {object} [opts.log]           logger, 默认 console
 * @returns {{ runner, summarizer, detectors, storage, start, stop, providerId }}
 * start/stop:24h cron control
 * providerId:实际生效的 providerId (e.g. 'ollama' | 'openai' | ...)
 */
function buildDailyDigestRunner(opts = {}) {
 const cfg = mergeAISessionsConfig(opts.config, opts.runtimeOverride);
 const storage = makeStateStoreStorage(opts.statePath);
 const httpClient = opts.httpClient || new HttpClient({ timeout:120_000, maxRetries:1 });
 const providerId = SUPPORTED_PROVIDERS.includes(cfg.provider) ? cfg.provider : 'ollama';

 let summarizer;
 if (providerId === 'ollama') {
 const ollamaCfg = cfg.ollama || {};
 const model = ollamaCfg.model || 'qwen3.5:9b';
 const summarizerImpl = opts.summarizerImpl || new OllamaSummarizer();
 summarizer = new LLMSummarizer({
 provider: 'ollama',
 model,
 impl: summarizerImpl,
 config: { host: ollamaCfg.host || 'http://localhost:11434' },
 httpClient,
 });
 } else {
 // cloud: openai / anthropic / deepseek / minimax
 const cloudCfg = cfg.cloud || {};
 const model = cloudCfg.model || null;
 const resolver = opts.resolveApiKey || _defaultResolveApiKey;
 const apiKey = resolver(providerId);
 if (!apiKey) {
 summarizer = _makeStubSummarizer(providerId, `api key not found for provider ${providerId} (Settings modal存)`);
 } else if (!model) {
 summarizer = _makeStubSummarizer(providerId, `model not configured for provider ${providerId} (Settings modal选)`);
 } else {
 const summarizerImpl = opts.summarizerImpl || new CloudSummarizer();
 summarizer = new LLMSummarizer({
 provider: providerId,
 model,
 impl: summarizerImpl,
 config: {
 providerId,
 model,
 apiKey,
 baseUrl: typeof cloudCfg.baseUrl === 'string' ? cloudCfg.baseUrl : undefined,
 },
 httpClient,
 });
 }
 }

 const cursorImpl = opts.detectorImpl || new CursorDetectorImpl();
 const detectors = [new AISessionDetector({ appName: cursorImpl.appName, impl: cursorImpl })];
 const log = opts.log || {
 info: (...a) => console.log('[digest]', ...a),
 warn: (...a) => console.warn('[digest]', ...a),
 error: (...a) => console.error('[digest]', ...a),
 };
 const runner = new DailyDigestRunner({
 detectors,
 summarizer,
 storage,
 config: {
 enabled: Boolean(cfg.enabled),
 backfillDays: cfg.backfillDays || DEFAULT_BACKFILL_DAYS,
 backfillOnStart: cfg.backfillOnStart !== false,
 locale: cfg.locale || 'zh-CN',
 },
 log,
 });

 let intervalHandle = null;
 function start(intervalMs =86400_000) {
 if (intervalHandle) return; // idempotent
 intervalHandle = setInterval(() => {
 const now = Date.now();
 const yesterday = runner._dateKeyDaysAgo(1, now);
 runner.runOne(yesterday, { now }).catch((err) => {
 log.error(`[digest] interval ${yesterday} failed: ${err.message}`);
 });
 }, intervalMs);
 }
 function stop() {
 if (intervalHandle) {
 clearInterval(intervalHandle);
 intervalHandle = null;
 }
 }

 return { runner, summarizer, detectors, storage, start, stop, providerId };
}

module.exports = {
 buildDailyDigestRunner,
 makeStateStoreStorage,
 mergeAISessionsConfig,
 _defaultResolveApiKey,
 SUPPORTED_PROVIDERS,
 DEFAULT_BACKFILL_DAYS,
 BACKFILL_SLEEP_MS,
};
