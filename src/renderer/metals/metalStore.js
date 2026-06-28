/**
 * src/renderer/metals/metalStore.js
 *
 * Renderer-side signals for metals: config / quoteCache / fxCache / schedulerState.
 * Subscribes to main-process events via window.metalsApi.
 */

import { signal, computed } from '@preact/signals';

export const config = signal({
  watchedIds: ['XAU', 'XAG', 'AU9999', 'AG9999'],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [],
});

export const quoteCache = signal({ data: {}, errors: {}, fetchedAt: null });
export const fxCache = signal({ rate: null, fetchedAt: null });
export const schedulerState = signal({ status: 'idle', lastFetch: null, nextFetch: null });

export const addModalOpen = signal(false);
export const editingMetalId = signal(null);

export const historyMap = signal({});
export const selectedMetalId = signal('XAU');

export const overview = computed(() => {
  const cfg = config.value;
  const quotes = quoteCache.value.data;
  const fx = fxCache.value.rate;

  let totalMV = 0;
  let totalCost = 0;
  let todayEst = 0;
  let hasFxMissing = false;

  for (const [id, holding] of Object.entries(cfg.holdings)) {
    if (!holding) continue;
    const quote = quotes[id];
    if (!quote) continue;

    let currentCNY;
    if (quote.currency === 'CNY') currentCNY = quote.price;
    else if (fx == null) {
      hasFxMissing = true;
      continue;
    } else currentCNY = quote.price * fx;

    totalMV += currentCNY * holding.quantity;
    totalCost += holding.costPriceCNY * holding.quantity;

    let todayCNY;
    if (quote.currency === 'CNY') todayCNY = quote.change;
    else if (fx == null) todayCNY = 0;
    else todayCNY = quote.change * fx;
    todayEst += todayCNY * holding.quantity;
  }

  return {
    totalMarketValueCNY: hasFxMissing && totalMV === 0 ? null : totalMV,
    totalPnlCNY: hasFxMissing && totalMV === 0 ? null : totalMV - totalCost,
    todayEstimatedCNY: hasFxMissing && totalMV === 0 ? null : todayEst,
  };
});

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
  await window.metalsApi.fetchNow();
}

export async function updateConfig(patch) {
  if (!window.metalsApi) return;
  const next = await window.metalsApi.updateConfig(patch);
  config.value = next;
}

export async function upsertHolding(id, holding) {
  if (!window.metalsApi) return;
  const next = await window.metalsApi.upsertHolding(id, holding);
  config.value = next;
}

export async function removeHolding(id) {
  if (!window.metalsApi) return;
  const next = await window.metalsApi.removeHolding(id);
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