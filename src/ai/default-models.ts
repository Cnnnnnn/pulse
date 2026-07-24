/**
 * src/ai/default-models.ts
 *
 * 各 cloud provider 缺省模型 — 主进程 shared-llm 与 renderer 共用，无 Node 依赖.
 *
 * Phase 5: export-only（renderer 共享，禁止 module.exports）。
 */

export const DEFAULT_MODELS = {
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-latest",
  deepseek: "deepseek-chat",
  minimax: "MiniMax-M3",
};
