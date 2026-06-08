/**
 * src/ai-sessions/index.js
 *
 * Phase B1a (AI Sessions Daily Digest): 统一导出 + main process 入口.
 *
 * B1 scope: 导出抽象 + storage helpers, 不依赖具体实现 (cursor / ollama / cloud).
 * 后续 B2/B3/B6 阶段加具体实现, 在这里 re-export.
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const { AISessionDetector } = require('./detector');
const { LLMSummarizer } = require('./summarizer');
const { DailyDigestRunner, DEFAULT_BACKFILL_DAYS, BACKFILL_SLEEP_MS } = require('./digest');
const storage = require('./storage');
const prompts = require('./prompts');

module.exports = {
  // 抽象
  AISessionDetector,
  LLMSummarizer,
  DailyDigestRunner,
  // helpers
  storage,
  prompts,
  // 常量
  DEFAULT_BACKFILL_DAYS,
  BACKFILL_SLEEP_MS,
};
