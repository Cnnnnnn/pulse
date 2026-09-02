/**
 * src/ai/default-models.ts
 *
 * 各 cloud provider 缺省模型 — 主进程 shared-llm 与 renderer 共用，无 Node 依赖.
 *
 * Phase 5: export-only（renderer 共享，禁止 module.exports）。
 */

/**
 * P2-8: 这些是「未在 AI 设置里配置 model」时的 fallback 默认值.
 * API model id 会随 provider 升级而过时 — 用户在 AI 设置里配置/确认当前
 * model 名始终优先 (resolveSharedAiConfig 读 config.cloud.model)。
 * 2026-08 更新: Anthropic 升到 4.5 系列 (claude-3-5-* 已过时)。
 */
export const DEFAULT_MODELS = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-5",
  deepseek: "deepseek-chat",
  minimax: "MiniMax-M3",
};

/** 助手简单问答路由用的轻量模型（ponytail: 与主模型相同时路由无收益） */
export const FAST_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  deepseek: "deepseek-chat",
  minimax: "MiniMax-M2.1",
};

/** P1-6: 助手输出 max_tokens 默认值 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/**
 * P1-6: 思考型/推理型模型的推理 token 计入 max_tokens, 需更大输出预算.
 * (此前统一 8192 会让 MiniMax-M3 / deepseek-reasoner 在正文前就被截断)
 */
export const THINKING_MODEL_MAX_TOKENS: Record<string, number> = {
  "MiniMax-M3": 16384,
  "deepseek-reasoner": 16384,
  o1: 16384,
  "o1-mini": 16384,
  o3: 16384,
};

/** P1-6: 按模型名解析输出 max_tokens (思考型加大, 否则默认) */
export function resolveMaxOutputTokens(
  model?: string,
  fallback: number = DEFAULT_MAX_OUTPUT_TOKENS,
): number {
  if (!model) return fallback;
  return THINKING_MODEL_MAX_TOKENS[model] ?? fallback;
}
