/**
 * src/renderer/store/ai-usage-store.js
 *
 * AI 用量 (multi-provider v2: minimax + glm coding plans) renderer state.
 *
 * 跟主进程 IPC: ai-usage:get-cached / ai-usage:fetch / ai-usage-updated.
 * 每个 provider 各自一组 signal 槽 (snapshot / prev / history / error / fetching / fromCache).
 * snapshot 不直接落 renderer 盘 — main 进程 state.json 才是 source of truth, renderer 只持有 "当前显示用" 副本.
 */

import { signal, computed } from "@preact/signals";
import { api } from "../api.js";
import { taggedLog } from "../log.js";
import { detectUsageAnomaly } from "../../ai-usage/anomaly-detect.js";

const log = taggedLog("[store/ai-usage]");

export const AI_USAGE_PROVIDERS = ["minimax", "glm"];

function emptySlots(value) {
  const out = {};
  for (const pid of AI_USAGE_PROVIDERS) out[pid] = value;
  return out;
}

/** 当前显示的 snapshot (从 main 同步). { minimax: object|null, glm: object|null } */
export const aiUsageSnapshot = signal(emptySlots(null));

/** 上一轮 snapshot — 用于算 burn rate / 预计耗尽时间. */
export const aiUsagePrevSnapshot = signal(emptySlots(null));

/** 历史 used 序列, 用于 sparkline. { minimax: {days}, glm: {days} } */
export const aiUsageHistory = signal(emptySlots({ days: [] }));

/** 上一轮 fetch 失败的 reason, 顶部 banner. */
export const aiUsageLastError = signal(emptySlots(null));

/** 当前是否正在 fetch (per-provider). */
export const aiUsageFetching = signal(emptySlots(false));

/** "snapshot 是从 cache 来的" — 区别于实时 (per-provider). */
export const aiUsageFromCache = signal(emptySlots(true));

/** 当前选中的 provider tab. */
export const aiUsageActiveProvider = signal("minimax");

/** A4 v2: 异常检测偏好 */
export const aiUsageAlertPrefs = signal({
  enabled: true,
  absMinPct: 55,
  spikeRatio: 1.5,
  reAlertStepPct: 5,
  lastNotified: {},
});

export const aiUsageAlertModalOpen = signal(false);

/** I6 v3: 用量异常未读角标 (进入 ai-usage 后清零) */
export const aiUsageNavBadge = signal(0);

let _badgeDismissed = false;

function recomputeAiUsageNavBadge() {
  if (_badgeDismissed) return;
  const prefs = aiUsageAlertPrefs.value;
  if (!prefs || prefs.enabled === false) {
    aiUsageNavBadge.value = 0;
    return;
  }
  let count = 0;
  for (const pid of AI_USAGE_PROVIDERS) {
    const hist = aiUsageHistory.value[pid];
    const days = hist && Array.isArray(hist.days) ? hist.days : [];
    const det = detectUsageAnomaly(days, {
      enabled: prefs.enabled,
      absMinPct: prefs.absMinPct,
      spikeRatio: prefs.spikeRatio,
      reAlertStepPct: prefs.reAlertStepPct,
    });
    if (det.anomaly) count++;
  }
  aiUsageNavBadge.value = count;
}

export function clearAiUsageNavBadge() {
  _badgeDismissed = true;
  aiUsageNavBadge.value = 0;
}

export function bumpAiUsageNavBadge(count = 1) {
  _badgeDismissed = false;
  const n = Math.max(1, Number(count) || 1);
  aiUsageNavBadge.value += n;
}

export function openAiUsageAlertModal() {
  aiUsageAlertModalOpen.value = true;
}

export function closeAiUsageAlertModal() {
  aiUsageAlertModalOpen.value = false;
}

export async function loadAiUsageAlertPrefs() {
  if (!api.aiUsageAlertPrefsGet) return;
  try {
    const r = await api.aiUsageAlertPrefsGet();
    if (r && r.ok && r.prefs) {
      aiUsageAlertPrefs.value = r.prefs;
      recomputeAiUsageNavBadge();
    }
  } catch (err) {
    log.warn("loadAiUsageAlertPrefs failed:", err && err.message);
  }
}

export async function saveAiUsageAlertPrefs(patch) {
  if (!api.aiUsageAlertPrefsSet) return { ok: false };
  try {
    const r = await api.aiUsageAlertPrefsSet(patch);
    if (r && r.ok && r.prefs) {
      aiUsageAlertPrefs.value = r.prefs;
      _badgeDismissed = false;
      recomputeAiUsageNavBadge();
    }
    return r;
  } catch (err) {
    log.warn("saveAiUsageAlertPrefs failed:", err && err.message);
    return { ok: false };
  }
}

let _subscribed = false;

/** 测试 hook: 重置 subscribe-once guard. 生产不调用. */
export function _resetSubscribeForTest() {
  _subscribed = false;
}

/**
 * 处理 main 主动 push 的 ai-usage-updated 事件 (单 provider).
 * @param {{provider: string, snapshot?: object, history?: {days: Array}}} data
 */
export function applyAiUsageEvent(data) {
  if (!data || !data.provider) return;
  const pid = data.provider;
  if (!AI_USAGE_PROVIDERS.includes(pid)) return;
  // 轮转: 当前 snapshot → prevSnapshot
  aiUsagePrevSnapshot.value = {
    ...aiUsagePrevSnapshot.value,
    [pid]: aiUsageSnapshot.value[pid],
  };
  aiUsageSnapshot.value = {
    ...aiUsageSnapshot.value,
    [pid]: data.snapshot || null,
  };
  aiUsageFromCache.value = { ...aiUsageFromCache.value, [pid]: false };
  aiUsageLastError.value = { ...aiUsageLastError.value, [pid]: null };
  if (data.history && Array.isArray(data.history.days)) {
    aiUsageHistory.value = { ...aiUsageHistory.value, [pid]: data.history };
  }
  recomputeAiUsageNavBadge();
}

/**
 * 启动期订阅 main push 事件. 幂等.
 */
export function subscribeAiUsageUpdates() {
  if (_subscribed) return;
  _subscribed = true;
  if (api && typeof api.onAiUsageUpdated === "function") {
    api.onAiUsageUpdated(applyAiUsageEvent);
  }
  if (api && typeof api.onSidenavBadge === "function") {
    api.onSidenavBadge((payload) => {
      if (payload && payload.key === "ai-usage") {
        bumpAiUsageNavBadge(payload.count || 1);
      }
    });
  }
}

/**
 * 启动时调用: 读 main 缓存的 last-known 全部 provider 快照 (如果有).
 * 不触发 fetch — 预热由 main bootstrap 完成, 这里只把已有数据拉到 UI.
 */
export async function loadAiUsageCached() {
  try {
    const r = await api.aiUsageGetCached();
    if (r && r.ok && r.providers) {
      const nextSnap = { ...aiUsageSnapshot.value };
      const nextFromCache = { ...aiUsageFromCache.value };
      for (const pid of AI_USAGE_PROVIDERS) {
        if (r.providers[pid] !== undefined) {
          nextSnap[pid] = r.providers[pid];
          nextFromCache[pid] = true;
        }
      }
      aiUsageSnapshot.value = nextSnap;
      aiUsageFromCache.value = nextFromCache;
    }
    if (r && r.ok && r.histories) {
      const nextHist = { ...aiUsageHistory.value };
      for (const pid of AI_USAGE_PROVIDERS) {
        if (r.histories[pid] && Array.isArray(r.histories[pid].days)) {
          nextHist[pid] = r.histories[pid];
        }
      }
      aiUsageHistory.value = nextHist;
    }
    await loadAiUsageAlertPrefs();
    recomputeAiUsageNavBadge();
  } catch (err) {
    log.warn("loadAiUsageCached threw:", err && err.message);
  }
}

/**
 * 手动触发某 provider 的 fetch. 失败时保留 last-known snapshot + 设 lastError.
 * @param {object} [opts] { provider, region }
 * @returns {Promise<{ok: boolean, provider?: string, reason?: string, error?: string}>}
 */
export async function fetchAiUsage(opts = {}) {
  const provider = opts.provider || aiUsageActiveProvider.value;
  if (!AI_USAGE_PROVIDERS.includes(provider)) {
    return { ok: false, reason: "unknown_provider" };
  }
  aiUsageFetching.value = { ...aiUsageFetching.value, [provider]: true };
  try {
    const r = await api.aiUsageFetch({ provider });
    if (r && r.ok) {
      // 成功 — main 已经 push 过 ai-usage-updated, applyAiUsageEvent 已更新 signal
      aiUsageLastError.value = { ...aiUsageLastError.value, [provider]: null };
      return r;
    }
    aiUsageLastError.value = {
      ...aiUsageLastError.value,
      [provider]: (r && (r.reason || r.error)) || "unknown",
    };
    return r || { ok: false, reason: "no_response" };
  } catch (err) {
    const out = { ok: false, reason: "threw", error: err && err.message };
    aiUsageLastError.value = {
      ...aiUsageLastError.value,
      [provider]: out.reason,
    };
    return out;
  } finally {
    aiUsageFetching.value = { ...aiUsageFetching.value, [provider]: false };
  }
}

/**
 * 切换当前展示的 provider tab.
 * @param {string} providerId
 */
export function setActiveProvider(providerId) {
  if (AI_USAGE_PROVIDERS.includes(providerId)) {
    aiUsageActiveProvider.value = providerId;
  }
}
