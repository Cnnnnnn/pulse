/**
 * src/renderer/store/prompt-store.js
 */

import { signal } from "@preact/signals";
import { api } from "../api.js";

/** @type {Signal<Record<string, {system: string, rules: string, fewShot: string, isDefault: boolean}>|null>} */
export const aiPrompts = signal(null);
export const aiPromptsLoading = signal(false);
export const aiPromptsSaving = signal(false);

const PROMPT_LABELS = {
  ithome_summary: "📰 IT之家文章摘要",
  worldcup_prematch: "🏆 世界杯赛前预测",
  worldcup_postmatch: "🏆 世界杯赛后总结",
  upgrade_advice: "💡 升级建议 (该不该升)",
  changelog_summary: "✨ Changelog 3 件大事",
  category_classify: "🏷️ App 分类",
};

export function promptLabel(key) {
  return PROMPT_LABELS[key] || key;
}

export async function loadAiPrompts() {
  if (!api || typeof api.aiPromptsLoad !== "function") return;
  aiPromptsLoading.value = true;
  try {
    aiPrompts.value = await api.aiPromptsLoad();
  } catch {
    /* keep null */
  } finally {
    aiPromptsLoading.value = false;
  }
}

export async function saveAiPrompts(prompts) {
  if (!api || typeof api.aiPromptsSave !== "function") return { ok: false };
  aiPromptsSaving.value = true;
  try {
    const r = await api.aiPromptsSave(prompts);
    if (r && r.ok) {
      aiPrompts.value = await api.aiPromptsLoad();
    }
    return r;
  } catch {
    return { ok: false };
  } finally {
    aiPromptsSaving.value = false;
  }
}

export async function resetAiPrompt(key) {
  if (!api || typeof api.aiPromptsReset !== "function") return { ok: false };
  try {
    const r = await api.aiPromptsReset(key);
    if (r && r.ok) {
      aiPrompts.value = await api.aiPromptsLoad();
    }
    return r;
  } catch {
    return { ok: false };
  }
}

export function subscribeAiPromptsUpdates() {
  if (!api || typeof api.onAiPromptsUpdated !== "function") return () => {};
  return api.onAiPromptsUpdated(() => {
    loadAiPrompts();
  });
}
