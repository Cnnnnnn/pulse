/**
 * src/renderer/metals/metalStore.js
 *
 * Renderer-side signals for metals: config / quoteCache / fxCache / schedulerState.
 * Subscribes to main-process events via window.metalsApi.
 *
 * 纯行情数据看板: 不含持仓/交易信号 (addModalOpen / editingMetalId / upsertHolding /
 * removeHolding / overview 已移除 — 模块不再展示持仓记账). 详情弹窗由 MetalLayout
 * 用 openMetalId 本地 state 控制, selectedMetalId 保留供旧测试, 组件不再直接消费.
 */

import { signal } from '@preact/signals';

export const config = signal({
  watchedIds: ['XAU', 'XAG', 'AU9999', 'AG9999'],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [],
});

export const quoteCache = signal({ data: {}, errors: {}, fetchedAt: null });
export const fxCache = signal({ rate: null, fetchedAt: null });
export const schedulerState = signal({ status: 'idle', lastFetch: null, nextFetch: null });

export const historyMap = signal({});

/**
 * 当前选中品种 (驱动详情面板). 复活原 dead signal —
 * MetalWatchlist 点选 → 写; MetalDetail 读.
 */
export const selectedMetalId = signal('XAU');

let _unsubQuote = null;
let _unsubState = null;
let _unsubHist = null;

export async function initMetalStore() {
  if (!window.metalsApi) {
    console.warn('[metals] window.metalsApi not exposed — check preload.js');
    return;
  }

  // 防御性: 如果之前注册过 (re-mount 时), 先清掉旧的, 避免 listener 堆积
  cleanupMetalStore();

  // Load initial config + state
  const cfg = await window.metalsApi.list();
  config.value = cfg;

  const state = await window.metalsApi.getState();
  if (state && state.quotes) quoteCache.value = state.quotes;
  if (state && state.fx) fxCache.value = state.fx;
  if (state && state.scheduler) schedulerState.value = state.scheduler;

  try {
    const hist = await window.metalsApi.getHistory();
    if (hist && hist.historyMap) historyMap.value = hist.historyMap;
  } catch (err) {
    console.warn('[metals] getHistory failed:', err && err.message);
  }

  // 冷启动兜底: 刚装/刚升级后 quoteCache 还没首次 fetch, 立即拉一次避免 tab 进去空白.
  // scheduler.start() 虽然 fire-and-forget 调 fetchNow, 但 fetch 失败时 cache 仍是空,
  // 用户不点刷新就永远空白. 这里串行 await: 失败时让 refresh 按钮处理.
  if (!quoteCache.value || !quoteCache.value.fetchedAt) {
    try {
      const r = await window.metalsApi.fetchNow();
      if (r && r.quotes) quoteCache.value = r.quotes;
      if (r && r.fx) fxCache.value = r.fx;
      // 串行 fetchNow 内部已经等 backfill 完成, 直接拿 response 里的 historyMap
      // 同步到 signal, 避免 "quote 出了但 30 天走势还在加载中" 的渲染竞态.
      if (r && r.historyMap) historyMap.value = r.historyMap;
    } catch (err) {
      console.warn('[metals] cold-start fetchNow failed:', err && err.message);
    }
  }

  // Subscribe to live updates (preload 返回 unsubscribe 函数)
  _unsubQuote = window.metalsApi.onQuoteChanged((data) => {
    if (data.quotes) quoteCache.value = data.quotes;
    if (data.fx) fxCache.value = data.fx;
  });

  _unsubState = window.metalsApi.onStateUpdate((data) => {
    schedulerState.value = data;
  });

  _unsubHist = window.metalsApi.onHistoryChanged((data) => {
    if (data && data.historyMap) historyMap.value = data.historyMap;
  });
}

/**
 * 解绑 IPC listener, 避免 MetalLayout 反复 mount/unmount 时 listener 堆积.
 * 幂等: 没注册过 / 重复调都安全.
 */
export function cleanupMetalStore() {
  if (_unsubQuote) {
    try { _unsubQuote(); } catch { /* noop */ }
    _unsubQuote = null;
  }
  if (_unsubState) {
    try { _unsubState(); } catch { /* noop */ }
    _unsubState = null;
  }
  if (_unsubHist) {
    try { _unsubHist(); } catch { /* noop */ }
    _unsubHist = null;
  }
}

export async function refreshNow() {
  if (!window.metalsApi) return;
  const r = await window.metalsApi.fetchNow();
  if (r && r.quotes) quoteCache.value = r.quotes;
  if (r && r.fx) fxCache.value = r.fx;
  // fetchNow 现在串行等 backfill, response 里直接带最新 historyMap,
  // 同步到 signal 避免依赖 onHistoryChanged 事件时序.
  if (r && r.historyMap) historyMap.value = r.historyMap;
}

export async function updateConfig(patch) {
  if (!window.metalsApi) return;
  const next = await window.metalsApi.updateConfig(patch);
  config.value = next;
}

/**
 * 测试用: 把 signals 重置回 initial value, 解绑 listener.
 * 幂等. 不调 IPC (假设 window.metalsApi 不存在时也安全).
 */
export function resetMetalStore() {
  cleanupMetalStore();
  config.value = {
    watchedIds: ['XAU', 'XAG', 'AU9999', 'AG9999'],
    holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
    deletedIds: [],
  };
  quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
  fxCache.value = { rate: null, fetchedAt: null };
  schedulerState.value = { status: 'idle', lastFetch: null, nextFetch: null };
  historyMap.value = {};
  selectedMetalId.value = 'XAU';
  if (typeof window !== 'undefined' && window.metalsApi) {
    delete window.metalsApi;
  }
}
