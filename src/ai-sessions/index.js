/**
 * src/ai-sessions/index.js
 *
 * 统一导出 + main process 入口.
 *
 * 重做版: DailyDigestRunner → TaskSummaryEngine (任务为中心、按需生成).
 *
 * CommonJS, 跟 src/config/ 一致.
 */

const { AISessionDetector } = require('./detector');
const { LLMSummarizer } = require('./summarizer');
const { TaskSummaryEngine } = require('./engine');
const storage = require('./storage');
const prompts = require('./prompts');

module.exports = {
  // 抽象
  AISessionDetector,
  LLMSummarizer,
  TaskSummaryEngine,
  // helpers
  storage,
  prompts,
};
