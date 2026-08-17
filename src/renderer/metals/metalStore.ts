/**
 * src/renderer/metals/metalStore.ts
 *
 * Renderer-side signals for metals: config / quoteCache / fxCache / schedulerState.
 * Subscribes to main-process events via window.metalsApi.
 *
 * 纯行情数据看板: 不含持仓/交易信号 (addModalOpen / editingMetalId / upsertHolding /
 * removeHolding / overview 已移除 — 模块不再展示持仓记账). 详情弹窗由 MetalLayout
 * 用 openMetalId 本地 state 控制, selectedMetalId 保留供旧测试, 组件不再直接消费.
 */

import { signal } from '@preact/signals';
import {
  beginDataRequest,
  createDataState,
  rejectData,
  resolveData,
} from '../../shared/data-state.ts';
import type { DataState, DataSource } from '../../shared/data-state.ts';
import type {
  MetalConfigContract,
  MetalStateResponse,
} from '../../shared/ipc-contracts.ts';

type MetalQuoteCache = {
  data: Record<string, any>;
  errors: Record<string, any>;
  fetchedAt: number | null;
};

type MetalFxCache = {
  rate: number | null;
  fetchedAt: number | null;
};

export type MetalDataSnapshot = {
  quotes: MetalQuoteCache;
  fx: MetalFxCache;
  historyMap: Record<string, any>;
};

function emptyMetalDataSnapshot(): MetalDataSnapshot {
  return {
    quotes: { data: {}, errors: {}, fetchedAt: null },
    fx: { rate: null, fetchedAt: null },
    historyMap: {},
  };
}

export const config = signal<MetalConfigContract>({
  watchedIds: ['XAU', 'XAG', 'AU9999', 'AG9999'],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [] as string[],
});

export const quoteCache = signal<MetalQuoteCache>({ data: {}, errors: {}, fetchedAt: null });
export const fxCache = signal<MetalFxCache>({ rate: null, fetchedAt: null });
export const schedulerState = signal<MetalStateResponse['scheduler']>({
  status: 'idle',
  lastFetch: null,
  nextFetch: null,
});

export const historyMap = signal<Record<string, any>>({});
export const metalDataState = signal<DataState<MetalDataSnapshot>>(
  createDataState(emptyMetalDataSnapshot()),
);

function currentMetalData(): MetalDataSnapshot {
  return {
    quotes: {
      data: { ...(quoteCache.value.data || {}) },
      errors: { ...(quoteCache.value.errors || {}) },
      fetchedAt: quoteCache.value.fetchedAt || null,
    },
    fx: { ...fxCache.value },
    historyMap: { ...(historyMap.value || {}) },
  };
}

function resolveMetalData(source: DataSource = 'live') {
  const data = currentMetalData();
  metalDataState.value = resolveData(
    metalDataState.value,
    data,
    { source, fetchedAt: data.quotes.fetchedAt || undefined },
  );
}

function applyMetalResponse(response: any, source: DataSource = 'live') {
  if (response && response.quotes) quoteCache.value = response.quotes;
  if (response && response.fx) fxCache.value = response.fx;
  if (response && response.historyMap) historyMap.value = response.historyMap;
  resolveMetalData(source);
}

/**
 * 投资 nav 合并 (2026-07-13) N2: refreshNow loading 态.
 *   进 refreshNow 设 true, finally 设 false —— 失败也归零.
 *   供 InvestLayout 读 metalsRefreshing 让 Header 刷新按钮转圈.
 */
export const metalsRefreshing = signal(false);

/**
 * 当前选中品种 (驱动详情面板). 复活原 dead signal —
 * MetalWatchlist 点选 → 写; MetalDetail 读.
 */
export const selectedMetalId = signal('XAU');

let _unsubQuote: (() => void) | null = null;
let _unsubState: (() => void) | null = null;
let _unsubHist: (() => void) | null = null;

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
  } catch (err: any) {
    console.warn('[metals] getHistory failed:', err && err.message);
  }

  if (quoteCache.value && quoteCache.value.fetchedAt) {
    resolveMetalData('cache');
  } else {
    metalDataState.value = beginDataRequest(metalDataState.value);
  }

  // 冷启动兜底: 刚装/刚升级后 quoteCache 还没首次 fetch, 立即拉一次避免 tab 进去空白.
  // scheduler.start() 虽然 fire-and-forget 调 fetchNow, 但 fetch 失败时 cache 仍是空,
  // 用户不点刷新就永远空白. 这里串行 await: 失败时让 refresh 按钮处理.
  if (!quoteCache.value || !quoteCache.value.fetchedAt) {
    try {
      const r = await window.metalsApi.fetchNow();
      if (r && r.ok === false) {
        throw new Error(r.reason || '刷新失败');
      }
      // 串行 fetchNow 内部已经等 backfill 完成, 直接拿 response 里的 historyMap
      // 同步到 signal, 避免 "quote 出了但 30 天走势还在加载中" 的渲染竞态.
      applyMetalResponse(r);
    } catch (err: any) {
      metalDataState.value = rejectData(metalDataState.value, err);
      console.warn('[metals] cold-start fetchNow failed:', err instanceof Error ? err.message : String(err));
    }
  }

  // Subscribe to live updates (preload 返回 unsubscribe 函数)
  _unsubQuote = window.metalsApi.onQuoteChanged((data: any) => {
    if (data.quotes) quoteCache.value = data.quotes;
    if (data.fx) fxCache.value = data.fx;
    resolveMetalData('live');
  });

  _unsubState = window.metalsApi.onStateUpdate((data: any) => {
    schedulerState.value = data;
  });

  _unsubHist = window.metalsApi.onHistoryChanged((data: any) => {
    if (data && data.historyMap) historyMap.value = data.historyMap;
    resolveMetalData('live');
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
  metalsRefreshing.value = true;
  metalDataState.value = beginDataRequest(metalDataState.value);
  try {
    const r = await window.metalsApi.fetchNow();
    if (r && r.ok === false) {
      metalDataState.value = rejectData(metalDataState.value, r.reason || '刷新失败');
      return r;
    }
    // fetchNow 现在串行等 backfill, response 里直接带最新 historyMap,
    // 同步到 signal 避免依赖 onHistoryChanged 事件时序.
    applyMetalResponse(r);
    return r;
  } catch (err) {
    metalDataState.value = rejectData(metalDataState.value, err);
    throw err;
  } finally {
    metalsRefreshing.value = false;
  }
}

export async function updateConfig(patch: any) {
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
    deletedIds: [] as string[],
  };
  quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
  fxCache.value = { rate: null, fetchedAt: null };
  schedulerState.value = { status: 'idle', lastFetch: null, nextFetch: null };
  historyMap.value = {};
  metalDataState.value = createDataState(emptyMetalDataSnapshot());
  metalsRefreshing.value = false;
  selectedMetalId.value = 'XAU';
  if (typeof window !== 'undefined' && window.metalsApi) {
    delete window.metalsApi;
  }
}
