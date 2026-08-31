/**
 * src/renderer/store/ai-store.ts
 *
 * AI 任务总结 (Phase B7d) + AI Sessions Settings (Phase B6c) + Drawer 状态.
 *
 * 与主进程 IPC: ai-tasks:list/summarize + ai-sessions:* + ai:get-shared-config.
 * 跟 state.json / safeStorage 同步.
 */

import { signal, computed } from "@preact/signals";
import { DEFAULT_MODELS } from "../../ai/default-models.ts";
import { api } from "../api.ts";
import { taggedLog } from "../log.ts";
import { showToast } from "./toast-store.ts";
import { aiTasksDrawerOpen, digestConfigMode } from "../digest/digest-store.ts";
import type {
  AiHealthcheckOptions,
  AiHealthcheckResponse,
  AiKeyStatus,
  AiSessionsConfig,
  AiSessionsConfigUpdatedPayload,
  AiTask,
  AiTaskSourceStat,
  AiTaskSummaryUpdatedPayload,
  AiTasksSummarizeResponse,
} from "../../shared/ipc-contracts";

const log = taggedLog("[store/ai]");

export function localDateKey(offsetDays = 0, now?: number) {
  const t =
    (typeof now === "number" ? now : Date.now()) - (offsetDays | 0) * 86400_000;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

export const aiSessionsEnabled = signal(false);
export const aiTasksDateKey = signal(localDateKey(0));
export const aiTasks = signal<AiTask[]>([]);
export const aiTasksSourceStats = signal<AiTaskSourceStat[]>([]);
export const aiTasksLoading = signal(false);
export const aiTasksError = signal<string | null>(null);
export const summarizingTaskKeys = signal<Set<string>>(new Set());
export const aiSummarizeBusy = computed(
  () => summarizingTaskKeys.value.size > 0,
);

export const aiSessionsConfig = signal<AiSessionsConfig | null>(null);
export const aiKeyStatus = signal<Record<string, AiKeyStatus>>({});
export const aiSettingsOpen = signal(false);
export const aiHealthcheckBusy = signal(false);
export const aiHealthcheckResult = signal<AiHealthcheckResponse | null>(null);

export function setAISessionsEnabled(enabled: any) {
  aiSessionsEnabled.value = Boolean(enabled);
}

export function syncEnabledFromConfig(cfg: AiSessionsConfig | null) {
  if (!cfg || typeof cfg !== "object") {
    aiSessionsEnabled.value = false;
    return;
  }
  const provider = cfg.provider || (cfg.cloud && cfg.cloud.providerId);
  aiSessionsEnabled.value = Boolean(provider);
}

function _aiProviderId(cfg: AiSessionsConfig | null) {
  if (!cfg || typeof cfg !== "object") return null;
  const id = cfg.provider || (cfg.cloud && cfg.cloud.providerId);
  return typeof id === "string" && id ? id : null;
}

function _aiModel(cfg: AiSessionsConfig | null, providerId: string | null) {
  if (!cfg || !providerId) return null;
  const cloud = cfg.cloud || {};
  if (typeof cloud.model === "string" && cloud.model) return cloud.model;
  return DEFAULT_MODELS[providerId] || null;
}

export function isAiReadyLocal() {
  const cfg = aiSessionsConfig.value;
  const providerId = _aiProviderId(cfg);
  if (!providerId) return false;
  if (!_aiModel(cfg, providerId)) return false;
  const st = aiKeyStatus.value[providerId];
  return !!(st && st.hasKey);
}

export function needsConfig() {
  return !isAiReadyLocal();
}

export async function refreshAIReadyStatus() {
  if (isAiReadyLocal()) return true;

  await Promise.allSettled([loadAISessionsConfig(), probeAIKeyStatuses()]);
  if (isAiReadyLocal()) return true;

  if (typeof api.getAiSharedConfig === "function") {
    try {
      const r = await api.getAiSharedConfig();
      if (r && r.ok) return !!r.ready;
    } catch {
      /* fall through */
    }
  }

  const providerId = _aiProviderId(aiSessionsConfig.value);
  if (!providerId || !_aiModel(aiSessionsConfig.value, providerId)) {
    return false;
  }
  try {
    const kr = await api.hasAiKey(providerId);
    return !!(kr && kr.ok && kr.hasKey);
  } catch {
    return false;
  }
}

export async function loadAiTasks(dateKey?: string) {
  const key =
    typeof dateKey === "string" && dateKey ? dateKey : aiTasksDateKey.value;
  const isDateSwitch = key !== aiTasksDateKey.value;
  aiTasksDateKey.value = key;
  aiTasksLoading.value = true;
  aiTasksError.value = null;
  if (isDateSwitch) aiTasks.value = [];
  try {
    const r = await api.listAiTasks({ dateKey: key });
    if (aiTasksDateKey.value !== key) return [];
    if (r.ok === true) {
      aiTasks.value = Array.isArray(r.tasks) ? r.tasks : [];
      aiTasksSourceStats.value = Array.isArray(r.sourceStats) ? r.sourceStats : [];
      return aiTasks.value;
    }
    aiTasksError.value = r.error || r.reason || "list_failed";
    return [];
  } catch (err: any) {
    aiTasksError.value = (err && err.message) || "list_threw";
    return [];
  } finally {
    if (aiTasksDateKey.value === key) aiTasksLoading.value = false;
  }
}

export async function summarizeAiTasks(
  taskKeys: unknown,
): Promise<AiTasksSummarizeResponse | null> {
  if (needsConfig()) return null;
  const keys = Array.isArray(taskKeys)
    ? taskKeys.filter((k: any) => typeof k === "string" && k.length > 0)
    : [];
  if (keys.length === 0) return null;
  const dateKey = aiTasksDateKey.value;
  summarizingTaskKeys.value = new Set([...summarizingTaskKeys.value, ...keys]);
  try {
    const r = await api.summarizeAiTasks({ dateKey, taskKeys: keys });
    if (r && !r.ok && typeof r.error === "string" && /^auth_/.test(r.error)) {
      showToast("API key 无效,请在设置里更新", "warn", 5000);
    }
    const authFail =
      r &&
      Array.isArray(r.failures) &&
      r.failures.some(
        (f: any) => f && typeof f.message === "string" && /^auth_/.test(f.message),
      );
    if (authFail) {
      showToast("API key 无效,请在设置里更新", "warn", 5000);
    }
    return r || null;
  } catch (err: any) {
    log.warn("summarizeAiTasks threw:", err && err.message);
    return null;
  } finally {
    const next = new Set(summarizingTaskKeys.value);
    for (const k of keys) next.delete(k);
    summarizingTaskKeys.value = next;
  }
}

export function applyTaskSummaryEvent(data: AiTaskSummaryUpdatedPayload) {
  if (!data || typeof data.taskKey !== "string") return;
  if (summarizingTaskKeys.value.has(data.taskKey)) {
    const next = new Set(summarizingTaskKeys.value);
    next.delete(data.taskKey);
    summarizingTaskKeys.value = next;
  }
  if (data.ok && data.task && data.dateKey === aiTasksDateKey.value) {
    aiTasks.value = aiTasks.value.map((t) =>
      t && t.taskKey === data.taskKey ? data.task : t,
    );
  }
}

export function subscribeAiTaskUpdates() {
  if (api && typeof api.onAiTaskSummaryUpdated === "function") {
    api.onAiTaskSummaryUpdated(applyTaskSummaryEvent);
  }
}

export function setAISessionsConfig(cfg: AiSessionsConfig | null) {
  aiSessionsConfig.value = cfg && typeof cfg === "object" ? cfg : null;
  syncEnabledFromConfig(aiSessionsConfig.value);
}

export function setAIKeyStatus(providerId: string, status: AiKeyStatus | null) {
  const next = { ...aiKeyStatus.value };
  if (status === null || status === undefined) {
    delete next[providerId];
  } else {
    next[providerId] = status;
  }
  aiKeyStatus.value = next;
}

export function setAIKeyStatuses(map: Record<string, AiKeyStatus>) {
  aiKeyStatus.value = map && typeof map === "object" ? { ...map } : {};
}

export function openAISettings(open: any = 0) {
  aiSettingsOpen.value = Boolean(open);
  if (open) {
    import("../recent/track.ts").then((m: any) => m.trackSettingsOpen());
  }
}

export function openDigestDrawer(open: any = 0) {
  aiTasksDrawerOpen.value = Boolean(open);
  if (!open) digestConfigMode.value = false;
}

export function toggleDigestDrawer(): void {
  const next = !aiTasksDrawerOpen.value;
  aiTasksDrawerOpen.value = next;
  if (!next) digestConfigMode.value = false;
}

export function setAIHealthcheckBusy(busy: any) {
  aiHealthcheckBusy.value = Boolean(busy);
}

export function setAIHealthcheckResult(r: AiHealthcheckResponse | null) {
  aiHealthcheckResult.value = r && typeof r === "object" ? r : null;
}

export async function loadAISessionsConfig() {
  try {
    const r = await api.getAiSessionsConfig();
    setAISessionsConfig(r && r.config ? r.config : null);
    return aiSessionsConfig.value;
  } catch {
    return null;
  }
}

export async function probeAIKeyStatuses() {
  const providers = ["openai", "anthropic", "deepseek", "minimax", "glm"];
  const next: Record<string, AiKeyStatus> = {};
  await Promise.all(
    providers.map(async (id: any) => {
      try {
        const r = await api.hasAiKey(id);
        if (r && r.ok)
          next[id] = {
            hasKey: Boolean(r.hasKey),
            available: Boolean(r.available),
          };
        else next[id] = { hasKey: false, available: false };
      } catch {
        next[id] = { hasKey: false, available: false };
      }
    }),
  );
  setAIKeyStatuses(next);
  return next;
}

export async function setAIKey(providerId: any, apiKey: any) {
  try {
    const r = await api.setAiKey(providerId, apiKey);
    if (r && r.ok) {
      setAIKeyStatus(providerId, { hasKey: true, available: true });
      return { ok: true };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err: any) {
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

export async function clearAIKey(providerId: any) {
  try {
    const r = await api.clearAiKey(providerId);
    if (r && r.ok) {
      setAIKeyStatus(providerId, { hasKey: false, available: true });
      return { ok: true };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// v2.83: 从密钥库条目引用 key — 主进程解密后直接写 ai-keys, 明文不经过 renderer
export async function aiUseVaultKey(providerId: any, vaultId: any) {
  try {
    const r = await api.aiUseVaultKey({ providerId, vaultId });
    if (r && r.ok) {
      setAIKeyStatus(providerId, { hasKey: true, available: true });
      return { ok: true };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err: any) {
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

export async function runAIHealthcheck(opts: AiHealthcheckOptions) {
  setAIHealthcheckBusy(true);
  try {
    const r = await api.aiHealthcheck(opts);
    setAIHealthcheckResult(r || { ok: false, error: "no_response" });
    if (r && !r.ok && typeof r.error === "string" && /^auth_/.test(r.error)) {
      showToast("API key 无效,请在设置里更新", "warn", 5000);
    }
    return r || { ok: false };
  } catch (err: any) {
    const out = { ok: false, error: (err && err.message) || "unknown" };
    setAIHealthcheckResult(out);
    if (/^auth_/.test(out.error || "")) {
      showToast("API key 无效,请在设置里更新", "warn", 5000);
    }
    return out;
  } finally {
    setAIHealthcheckBusy(false);
  }
}

export async function saveAISessionsConfig(cfg: AiSessionsConfig | null) {
  try {
    const r = await api.saveAiSessionsConfig(cfg);
    if (r && r.ok) {
      setAISessionsConfig(r.config || cfg);
      return { ok: true, config: r.config };
    }
    return { ok: false, reason: r && r.reason };
  } catch (err: any) {
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

export function subscribeAISessionsConfigUpdates() {
  if (api && typeof api.onAiSessionsConfigUpdated === "function") {
    api.onAiSessionsConfigUpdated((data: AiSessionsConfigUpdatedPayload) => {
      if (data && data.config !== undefined) {
        setAISessionsConfig(data.config || null);
      }
    });
  }
}
