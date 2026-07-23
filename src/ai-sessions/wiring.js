/**
 * src/ai-sessions/wiring.js
 *
 * 重做版 main 进程 wiring — 把 detectors + summarizer + storage 拼成可跑的
 * TaskSummaryEngine, 暴露给 main/index.js + ipc.js 用.
 *
 * cfg.provider 路由 (只支持云 provider):
 * - 'deepseek' | 'minimax' → CloudSummarizer (apiKey: storage.loadApiKey(providerId))
 * - 其它 (老 state.json 残留 'ollama' / 'openai' / 'anthropic') → fallback 到 'minimax'
 * - apiKey 拿不到 / model 缺失 → stub summarizer (summarize 永远 throw, 提示去配置)
 *
 * 抽出来便于单测. 单元测: tests/ai-sessions/wiring.test.js
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const { AISessionDetector } = require('./detector');
const { CursorDetectorImpl } = require('./cursor');
const { LLMSummarizer } = require('./summarizer');
const { CloudSummarizer } = require('./provider-cloud');
const { TaskSummaryEngine } = require('./engine');
const { HttpClient } = require('../main/http-client.ts');
const stateStore = require('../main/state-store');
const { SILENT_LOG } = require('./session-log');

// 只保留云 provider (minimax / deepseek).
const SUPPORTED_PROVIDERS = ['deepseek', 'minimax'];

/**
 * 合并 cfg (config.json sanitize 后) + runtimeOverride (state.json ai_sessions_config).
 * runtimeOverride 字段优先 (用户在 Settings 里改的).
 *
 * @param {object} cfg
 * @param {object|null} override
 * @returns {object}
 */
function mergeAISessionsConfig(cfg, override) {
  const base = cfg || { enabled: false, provider: 'minimax', cloud: null };
  if (!override || typeof override !== 'object') return base;
  const out = { ...base };
  if ('enabled' in override && typeof override.enabled === 'boolean') out.enabled = override.enabled;
  if ('provider' in override && typeof override.provider === 'string') out.provider = override.provider;
  if (override.cloud && typeof override.cloud === 'object') {
    out.cloud = { ...(base.cloud || {}), ...override.cloud };
  }
  if (typeof override.locale === 'string') out.locale = override.locale;
  return out;
}

/**
 * state-store 的 task_summaries 读写包装成 TaskSummaryEngine 期望的 storage 接口.
 * @param {string} [statePath] 注入便于测试
 * @returns {{ loadTaskSummaries, saveTaskSummary }}
 */
function makeStateStoreStorage(statePath) {
  return {
    loadTaskSummaries: () => stateStore.loadTaskSummaries(statePath),
    saveTaskSummary: (entry) => stateStore.saveTaskSummary(entry, statePath),
  };
}

/**
 * 从 safeStorage 拿 API key. DI 注入便于测试 (mock safeStorage).
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
 * "no api key" stub summarizer. summarize 永远 throw (UI 提示去配置).
 */
function _makeStubSummarizer(providerId, reason) {
  return new LLMSummarizer({
    provider: providerId,
    model: 'stub',
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
 * Build a TaskSummaryEngine wiring. main 进程 bootstrap 调一次, save-config 时重建.
 *
 * @param {object} opts
 * @param {object} opts.config              config.json aiSessions 块 (可缺)
 * @param {object} [opts.runtimeOverride]   state.json ai_sessions_config (优先)
 * @param {string} [opts.statePath]         注入 state.json 路径
 * @param {object} [opts.httpClient]        注入 HttpClient
 * @param {object} [opts.summarizerImpl]    注入 provider impl
 * @param {object} [opts.detectorImpl]      注入 CursorDetectorImpl
 * @param {Array}  [opts.extraDetectors]    [{appName, impl}] 注入 mock detectors
 * @param {function} [opts.resolveApiKey]   注入 apiKey resolver
 * @param {object} [opts.log]               logger
 * @returns {{ engine, summarizer, detectors, storage, providerId, enabled }}
 */
function buildTaskSummaryEngine(opts = {}) {
  const cfg = mergeAISessionsConfig(opts.config, opts.runtimeOverride);
  const storage = makeStateStoreStorage(opts.statePath);
  const httpClient = opts.httpClient || new HttpClient({ timeout: 120_000, maxRetries: 1 });
  const providerId = SUPPORTED_PROVIDERS.includes(cfg.provider) ? cfg.provider : 'minimax';

  let summarizer;
  {
    const cloudCfg = cfg.cloud || {};
    const model = cloudCfg.model || null;
    const resolver = opts.resolveApiKey || _defaultResolveApiKey;
    const apiKey = resolver(providerId);
    if (!apiKey) {
      summarizer = _makeStubSummarizer(providerId, `api key not found for provider ${providerId}`);
    } else if (!model) {
      summarizer = _makeStubSummarizer(providerId, `model not configured for provider ${providerId}`);
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

  if (Array.isArray(opts.extraDetectors)) {
    for (const ed of opts.extraDetectors) {
      if (!ed || !ed.appName || !ed.impl) continue;
      detectors.push(new AISessionDetector({ appName: ed.appName, impl: ed.impl }));
    }
  } else {
    // 默认: Codex + MiniMax Code (detector isInstalled() 内部 skip 未装的)
    const { CodexDetectorImpl } = require('./codex');
    const { MiniMaxCodeDetectorImpl } = require('./minimax-code');
    const detectorLog = opts.log || SILENT_LOG;
    detectors.push(new AISessionDetector({ appName: 'codex',        impl: new CodexDetectorImpl() }));
    detectors.push(new AISessionDetector({
      appName: 'minimax-code',
      impl: new MiniMaxCodeDetectorImpl({ log: detectorLog }),
    }));
  }

  const log = opts.log || SILENT_LOG;
  const engine = new TaskSummaryEngine({
    detectors,
    summarizer,
    storage,
    config: { locale: cfg.locale || 'zh-CN' },
    log,
  });

  return {
    engine,
    summarizer,
    detectors,
    storage,
    providerId,
    enabled: Boolean(cfg.provider || (cfg.cloud && cfg.cloud.providerId)),
  };
}

module.exports = {
  buildTaskSummaryEngine,
  makeStateStoreStorage,
  mergeAISessionsConfig,
  _defaultResolveApiKey,
  SUPPORTED_PROVIDERS,
};
