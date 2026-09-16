/**
 * provider 配置的一致性守护。
 *
 * 2026-09-16：UI 暴露了 glm 但后端准入名单漏了它 —— 用户切到 glm 后
 * `resolveSharedAiConfig()` 返回 unsupported_provider，助手直接不可用。
 * 根因是「provider 支持面」分散在三处（准入名单 / 路由表 / UI 列表），
 * 故下沉到 `src/shared/llm-providers.ts` 作为单一来源，并在此钉住一致性。
 *
 * 注：本文件刻意不 import `src/ai/shared-llm.ts`（它会拉起 main 侧 CJS bridge），
 * 改从 shared 取名单 —— 这也是名单下沉的收益之一。
 */
import { describe, expect, it } from "vitest";
import { SUPPORTED_PROVIDERS } from "../../src/shared/llm-providers";
import { PROVIDER_ENDPOINTS } from "../../src/ai-sessions/provider-cloud";
import {
  DEFAULT_MODELS,
  FAST_MODELS,
  resolveMaxOutputTokens,
} from "../../src/ai/default-models";

describe("provider 配置一致性", () => {
  const models = DEFAULT_MODELS as Record<string, string>;
  const supported = SUPPORTED_PROVIDERS as readonly string[];

  it("准入名单与路由表的 provider 集合完全一致", () => {
    expect([...SUPPORTED_PROVIDERS].sort()).toEqual(
      Object.keys(PROVIDER_ENDPOINTS).sort(),
    );
  });

  it("每个受支持的 provider 都有默认主模型", () => {
    const missing = supported.filter((p) => !models[p]);
    expect(missing).toEqual([]);
  });

  it("每个受支持的 provider 都有默认快模型", () => {
    const missing = supported.filter((p) => !FAST_MODELS[p]);
    expect(missing).toEqual([]);
  });

  it("默认模型表不含非受支持 provider（防陈旧条目）", () => {
    const extra = Object.keys(models).filter((p) => !supported.includes(p));
    expect(extra).toEqual([]);
  });

  it("每个 provider 的端点都有 protocol 字段（双协议路由依赖）", () => {
    for (const [id, ep] of Object.entries(PROVIDER_ENDPOINTS)) {
      const protocol = (ep as { protocol?: string }).protocol;
      expect(protocol, `${id} 缺少 protocol`).toMatch(/^(openai|anthropic)$/);
    }
  });
});

describe("resolveMaxOutputTokens —— 思考型模型的输出预算", () => {
  it("GLM-4.5 起的代际拿到加大预算（推理 token 计入输出）", () => {
    expect(resolveMaxOutputTokens("glm-5.2")).toBe(16384);
    expect(resolveMaxOutputTokens("glm-4.6")).toBe(16384);
  });

  it("同代未逐一列出的变体走前缀兜底", () => {
    expect(resolveMaxOutputTokens("glm-4.5-air")).toBe(16384);
    expect(resolveMaxOutputTokens("glm-5.2-preview")).toBe(16384);
  });

  it("已有思考型型号不受影响", () => {
    expect(resolveMaxOutputTokens("MiniMax-M3")).toBe(16384);
    expect(resolveMaxOutputTokens("deepseek-reasoner")).toBe(16384);
  });

  it("非思考型模型与空值仍用默认", () => {
    expect(resolveMaxOutputTokens("gpt-4o")).toBe(8192);
    expect(resolveMaxOutputTokens(undefined)).toBe(8192);
    expect(resolveMaxOutputTokens("gpt-4o", 4096)).toBe(4096);
  });
});
