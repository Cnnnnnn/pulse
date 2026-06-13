/**
 * src/ai/default-models.js
 *
 * 各 cloud provider 缺省模型 — 主进程 shared-llm 与 renderer 共用，无 Node 依赖.
 */

const DEFAULT_MODELS = {
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-latest",
  deepseek: "deepseek-chat",
  minimax: "MiniMax-M3",
};

module.exports = { DEFAULT_MODELS };
