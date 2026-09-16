/**
 * 共享 LLM 的 provider 支持面 — 单一事实来源（main 与 renderer 共用）。
 *
 * 为什么下沉到 shared：
 *  此前该名单只存在于 `src/ai/shared-llm.ts`，而 renderer 的 key 探测
 *  （`store/ai-store.ts`）另有一份硬编码副本 —— 结果 UI 暴露了 glm 而准入名单
 *  没有它，用户切到 glm 后 `resolveSharedAiConfig()` 返回 unsupported_provider，
 *  助手直接不可用（2026-09-16 修复）。
 *
 *  renderer 不能 import `src/ai/shared-llm.ts`（它会拉起 main 侧的 CJS bridge），
 *  故名单下沉到 shared 供两端共用。
 *
 * ⚠️ 本名单必须与 `PROVIDER_ENDPOINTS`（`src/ai-sessions/provider-cloud.ts`）的 key
 *    集合保持一致；`tests/ai/provider-config.test.ts` 有一致性断言守护。
 */

/** 受支持的 provider（顺序即设置页展示顺序） */
export const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "deepseek",
  "minimax",
  "glm",
] as const;

export type LlmProviderId = (typeof SUPPORTED_PROVIDERS)[number];
