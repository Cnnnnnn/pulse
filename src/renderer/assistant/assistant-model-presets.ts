/**
 * 助手模型候选 — 从 AI 设置 + 内置默认合并.
 */
import { DEFAULT_MODELS, FAST_MODELS } from "../../ai/default-models.ts";
import type { AiSessionsConfig } from "../../shared/ipc-contracts.ts";

/** ponytail: 前缀启发式，未知模型一律放行 */
const MODEL_PREFIX_BY_PROVIDER: Record<string, RegExp[]> = {
  deepseek: [/^deepseek/i],
  minimax: [/^minimax/i, /^abab/i],
  glm: [/^glm/i],
  openai: [/^gpt-/i, /^o\d/i],
  anthropic: [/^claude/i],
};

export function resolveAssistantProviderId(
  cfg: AiSessionsConfig | null | undefined,
): string {
  return (
    (cfg?.cloud && (cfg.cloud as { providerId?: string }).providerId) ||
    cfg?.provider ||
    "deepseek"
  );
}

export function guessModelProvider(model: string): string | null {
  const t = model.trim();
  if (!t) return null;
  for (const [provider, patterns] of Object.entries(MODEL_PREFIX_BY_PROVIDER)) {
    if (patterns.some((p) => p.test(t))) return provider;
  }
  return null;
}

export function isModelLikelyForProvider(
  model: string,
  providerId: string,
): boolean {
  const guess = guessModelProvider(model);
  if (!guess) return true;
  return guess === providerId;
}

export function partitionModelPresetsByProvider(
  presets: string[],
  providerId: string,
): { matched: string[]; mismatched: string[] } {
  const matched: string[] = [];
  const mismatched: string[] = [];
  for (const raw of presets) {
    const t = raw.trim();
    if (!t) continue;
    if (isModelLikelyForProvider(t, providerId)) matched.push(t);
    else mismatched.push(t);
  }
  return { matched, mismatched };
}

export function listAssistantModelPresets(
  cfg: AiSessionsConfig | null | undefined,
): string[] {
  const provider = resolveAssistantProviderId(cfg);
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(cfg?.cloud?.model);
  push(cfg?.assistantFastModel);
  if (Array.isArray(cfg?.assistantModelPresets)) {
    for (const p of cfg.assistantModelPresets) push(p);
  }
  push((DEFAULT_MODELS as Record<string, string>)[provider]);
  push((FAST_MODELS as Record<string, string>)[provider]);
  const { matched, mismatched } = partitionModelPresetsByProvider(out, provider);
  return [...matched, ...mismatched];
}

export function listMismatchedModelPresets(
  cfg: AiSessionsConfig | null | undefined,
): string[] {
  const provider = resolveAssistantProviderId(cfg);
  const raw: string[] = [];
  if (Array.isArray(cfg?.assistantModelPresets)) {
    for (const p of cfg.assistantModelPresets) {
      if (typeof p === "string" && p.trim()) raw.push(p.trim());
    }
  }
  return partitionModelPresetsByProvider(raw, provider).mismatched;
}

export function parseModelPresetsText(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

export function formatModelPresetsText(presets: string[] | undefined): string {
  if (!Array.isArray(presets) || presets.length === 0) return "";
  return presets.join("\n");
}

export type ThreadModelView = {
  mode: "default" | "fast" | "custom";
  custom?: string;
};

export function formatThreadModelLabel(
  cfg: AiSessionsConfig | null | undefined,
  thread: ThreadModelView,
): string {
  const provider = resolveAssistantProviderId(cfg);
  if (thread.mode === "fast") {
    const fast =
      (typeof cfg?.assistantFastModel === "string" && cfg.assistantFastModel.trim()) ||
      (FAST_MODELS as Record<string, string>)[provider] ||
      "轻量";
    return `轻量 · ${fast}`;
  }
  if (thread.mode === "custom") {
    return thread.custom?.trim()
      ? `自定义 · ${thread.custom.trim()}`
      : "自定义模型";
  }
  const main =
    cfg?.cloud?.model ||
    (DEFAULT_MODELS as Record<string, string>)[provider] ||
    provider;
  return `默认 · ${main}`;
}
