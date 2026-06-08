/**
 * src/ai-sessions/wiring.js
 *
 * Phase B4 (AI Sessions Daily Digest): main 进程 wiring.
 *
 * 把 B1 (抽象) + B2 (CursorDetector) + B3 (OllamaSummarizer) 拼成可跑的
 * DailyDigestRunner, 暴露给 main/index.js bootstrap 用.
 *
 * 抽出来便于单测 (不污染 main/index.js 启动流程), 跟 storage wrapper
 * 一起 make 出来. 单元测: tests/ai-sessions/wiring.test.js
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const { AISessionDetector } = require('./detector');
const { CursorDetectorImpl } = require('./cursor');
const { LLMSummarizer } = require('./summarizer');
const { OllamaSummarizer } = require('./provider-ollama');
const { DailyDigestRunner, DEFAULT_BACKFILL_DAYS, BACKFILL_SLEEP_MS } = require('./digest');
const { HttpClient } = require('../main/http-client');
const stateStore = require('../main/state-store');

/**
 * 把 state-store 的 loadDailyDigests / hasDailyDigest / saveDailyDigest
 * 包装成 DailyDigestRunner 期望的 storage 接口.
 *
 * @param {string} [statePath]  注入便于测试
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
 * Build a DailyDigestRunner. main 进程 bootstrap 调一次.
 *
 * @param {object} opts
 * @param {object} opts.config          sanitizeConfig() 返的 aiSessions 配置块
 * @param {string} [opts.statePath]    注入 state.json 路径
 * @param {object} [opts.httpClient]   注入 HttpClient (默认 new)
 * @param {object} [opts.summarizerImpl] 注入 OllamaSummarizer (默认 new)
 * @param {object} [opts.detectorImpl]   注入 CursorDetectorImpl (默认 new)
 * @param {object} [opts.log]          logger, 默认 console
 * @returns {{ runner, summarizer, detectors, storage, stop: () => void }}
 *   stop() 清 24h 定时 + 跑 runner 引用 (热重载 / 测试用)
 */
function buildDailyDigestRunner(opts = {}) {
  const cfg = opts.config || { enabled: false, provider: 'ollama', ollama: {} };
  const storage = makeStateStoreStorage(opts.statePath);
  const httpClient = opts.httpClient || new HttpClient({ timeout: 120_000, maxRetries: 1 });
  const ollamaCfg = cfg.ollama || {};
  const model = ollamaCfg.model || 'qwen3.5:9b';
  const summarizerImpl = opts.summarizerImpl || new OllamaSummarizer();
  const summarizer = new LLMSummarizer({
    provider: cfg.provider || 'ollama',
    model,
    impl: summarizerImpl,
    config: { host: ollamaCfg.host || 'http://localhost:11434' },
    httpClient,
  });
  const cursorImpl = opts.detectorImpl || new CursorDetectorImpl();
  const detectors = [new AISessionDetector({ appName: cursorImpl.appName, impl: cursorImpl })];
  const log = opts.log || {
    info:  (...a) => console.log('[digest]', ...a),
    warn:  (...a) => console.warn('[digest]', ...a),
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
  function start(intervalMs = 86400_000) {
    if (intervalHandle) return;  // idempotent
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

  return { runner, summarizer, detectors, storage, start, stop };
}

module.exports = {
  buildDailyDigestRunner,
  makeStateStoreStorage,
  DEFAULT_BACKFILL_DAYS,
  BACKFILL_SLEEP_MS,
};
