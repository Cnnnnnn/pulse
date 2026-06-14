/**
 * src/renderer/store/ai-usage-store.js
 *
 * AI 用量 (Minimax coding plan) renderer state.
 *
 * 跟主进程 IPC: ai-usage:get-cached / ai-usage:fetch / ai-usage-updated.
 * snapshot 直接存在 main 进程的 state.json, renderer 只持有 "当前显示用" 副本.
 *
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.2
 */

import { signal } from "@preact/signals";
import { api } from "../api.js";
import { taggedLog } from "../log.js";

const log = taggedLog("[store/ai-usage]");

/** 当前显示的 snapshot (从 main 同步) */
export const aiUsageSnapshot = signal(null);

/** 上一轮 snapshot — 用于算 burn rate / 预计耗尽时间. 首次启动为 null. */
export const aiUsagePrevSnapshot = signal(null);

/** 历史 used 序列, 用于 sparkline. { days: [{date, used, percent, updatedAt}] } */
export const aiUsageHistory = signal({ days: [] });

/** 上一轮 fetch 失败的 reason, 用于在 UI 顶部显示 banner */
export const aiUsageLastError = signal(null);

/** 当前是否正在 fetch (手动按钮 / 自动预热) */
export const aiUsageFetching = signal(false);

/** "snapshot 是从 cache 来的" — 区别于实时 */
export const aiUsageFromCache = signal(true);

let _subscribed = false;

/** 测试 hook: 重置 subscribe-once guard. 生产不调用. */
export function _resetSubscribeForTest() {
  _subscribed = false;
}

/**
 * 处理 main 主动 push 的 ai-usage-updated 事件.
 * @param {{snapshot?: object, prevSnapshot?: object|null, history?: {days: Array}}} data
 */
export function applyAiUsageEvent(data) {
  if (!data || !data.snapshot) return;
  // 轮转: 当前 snapshot → prevSnapshot (供下轮 diff)
  // 但只在 prevSnapshot 还没设过这一对时才覆盖 (避免覆盖刚刚手工测试时设的).
  // 简单起见: 每轮 push 总是把"当前"挪到"prev", 然后把新值放当前.
  aiUsagePrevSnapshot.value = aiUsageSnapshot.value;
  aiUsageSnapshot.value = data.snapshot;
  aiUsageFromCache.value = false;
  aiUsageLastError.value = null;
  // 历史 (sparkline)
  if (data.history && Array.isArray(data.history.days)) {
    aiUsageHistory.value = data.history;
  }
  // data.prevSnapshot 是 main 进程基于 state.json 的更老一个, 用不到 (signal 轮转已经够)
  void data.prevSnapshot;
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
 * 启动时调用: 读 main 缓存的 last-known snapshot (如果有).
 * 不触发 fetch — 预热由 main bootstrap 完成, 这里只把已有数据拉到 UI.
 */
export async function loadAiUsageCached() {
  try {
    const r = await api.aiUsageGetCached();
    if (r && r.ok && r.snapshot) {
      aiUsageSnapshot.value = r.snapshot;
      aiUsageFromCache.value = true;
    }
    if (r && r.ok && r.history && Array.isArray(r.history.days)) {
      aiUsageHistory.value = r.history;
    }
  } catch (err) {
    log.warn("loadAiUsageCached threw:", err && err.message);
  }
}

/**
 * 手动触发 fetch. 失败时保留 last-known snapshot + 设 lastError.
 * @param {object} [opts] { region }
 * @returns {Promise<{ok: boolean, reason?: string, error?: string}>}
 */
export async function fetchAiUsage(opts = {}) {
  aiUsageFetching.value = true;
  try {
    const r = await api.aiUsageFetch(opts);
    if (r && r.ok) {
      // 成功 — main 已经 push 过 ai-usage-updated, applyAiUsageEvent 已更新 signal
      aiUsageLastError.value = null;
      return r;
    }
    // 失败 — 保留 last-known snapshot
    aiUsageLastError.value = (r && (r.reason || r.error)) || "unknown";
    return r || { ok: false, reason: "no_response" };
  } catch (err) {
    const out = { ok: false, reason: "threw", error: err && err.message };
    aiUsageLastError.value = out.reason;
    return out;
  } finally {
    aiUsageFetching.value = false;
  }
}
