/**
 * 贵金属配置与历史持久化 Repository。
 *
 * metal-ipc 只负责 IPC、scheduler 和 live quote cache；本模块负责
 * state.json.metals 的默认值、数据规范化和原子更新，避免配置/历史写入
 * 分散在多个 IPC 回调里。
 */

export const DEFAULT_CONFIG = {
  watchedIds: ["XAU", "XAG", "AU9999", "AG9999"],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [],
  historyMap: {},
  lastBackfillAt: 0,
};

function isRecord(value: any): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// 按调用获取 state-store，兼容主进程测试对 state path 的隔离注入；生产中
// require cache 仍保证同一模块实例，不改变运行时开销。
function getStateStore(): any {
  return require("../state-store.ts");
}

function normalizeWatchedIds(value: any): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONFIG.watchedIds];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function normalizeHoldings(value: any): Record<string, any> {
  return isRecord(value)
    ? { ...DEFAULT_CONFIG.holdings, ...value }
    : { ...DEFAULT_CONFIG.holdings };
}

function normalizeHistoryMap(value: any): Record<string, any[]> {
  if (!isRecord(value)) return {};
  const out: Record<string, any[]> = {};
  for (const [id, points] of Object.entries(value)) {
    if (Array.isArray(points)) out[id] = points;
  }
  return out;
}

export function normalizeConfig(raw: any): any {
  const stored = isRecord(raw) ? raw : {};
  const lastBackfillAt = Number(stored.lastBackfillAt);
  return {
    watchedIds: normalizeWatchedIds(stored.watchedIds),
    holdings: normalizeHoldings(stored.holdings),
    deletedIds: Array.isArray(stored.deletedIds)
      ? stored.deletedIds
      : [],
    historyMap: normalizeHistoryMap(stored.historyMap),
    lastBackfillAt:
      Number.isFinite(lastBackfillAt) && lastBackfillAt > 0
        ? lastBackfillAt
        : 0,
  };
}

export function load(statePath?: any): any {
  const stateStore = getStateStore();
  const state = stateStore.load(statePath);
  return normalizeConfig(state && state.metals);
}

export function save(patch: any, statePath?: any): any {
  const stateStore = getStateStore();
  const current = load(statePath);
  const next = normalizeConfig({
    ...current,
    ...(isRecord(patch) ? patch : {}),
  });
  stateStore.patchState((nextState: any) => {
    nextState.metals = next;
  }, statePath);
  return next;
}

export function saveHistoryMap(historyMap: any, statePath?: any): any {
  const next = save({ historyMap }, statePath);
  return next.historyMap;
}

export function markBackfilled(atMs: number, statePath?: any): any {
  const next = save({ lastBackfillAt: atMs }, statePath);
  return next.lastBackfillAt;
}

module.exports = {
  DEFAULT_CONFIG,
  normalizeConfig,
  load,
  save,
  saveHistoryMap,
  markBackfilled,
};
