/**
 * src/renderer/store/ai-usage-store.js
 *
 * AI 用量 (multi-provider v2: minimax + glm coding plans) renderer state.
 *
 * 跟主进程 IPC: ai-usage:get-cached / ai-usage:fetch / ai-usage-updated.
 * 每个 provider 各自一组 signal 槽 (snapshot / prev / history / error / fetching / fromCache).
 * snapshot 不直接落 renderer 盘 — main 进程 state.json 才是 source of truth, renderer 只持有 "当前显示用" 副本.
 */

import { signal } from "@preact/signals";
import { api } from "../api.js";
import { taggedLog } from "../log.js";

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
  aiUsageSnapshot.value = { ...aiUsageSnapshot.value, [pid]: data.snapshot || null };
  aiUsageFromCache.value = { ...aiUsageFromCache.value, [pid]: false };
  aiUsageLastError.value = { ...aiUsageLastError.value, [pid]: null };
  if (data.history && Array.isArray(data.history.days)) {
    aiUsageHistory.value = { ...aiUsageHistory.value, [pid]: data.history };
  }
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
    aiUsageLastError.value = { ...aiUsageLastError.value, [provider]: out.reason };
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
