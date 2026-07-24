/**
 * src/ai-sessions/index.ts
 *
 * 统一导出 + main process 入口.
 *
 * 重做版: DailyDigestRunner → TaskSummaryEngine (任务为中心、按需生成).
 *
 * CommonJS, 跟 src/config/ 一致.
 */

import { AISessionDetector } from "./detector";
import { LLMSummarizer } from "./summarizer";
import { TaskSummaryEngine } from "./engine";
import * as storage from "./storage";
import * as prompts from "./prompts";

export { AISessionDetector, LLMSummarizer, TaskSummaryEngine, storage, prompts };

module.exports = {
  AISessionDetector,
  LLMSummarizer,
  TaskSummaryEngine,
  storage,
  prompts,
};
