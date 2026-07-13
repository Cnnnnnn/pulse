/**
 * src/renderer/store/newcar-store.js
 *
 * 「新车发布」模块 renderer 状态 (signals) + useNewCarData hook.
 * 复用 ai-usage-store 的模式: signal 槽 + subscribe + navBadge + 派生 hook.
 * 数据层 (src/newcar/) 是纯函数, 这里只持有"当前显示用"副本.
 */

import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import {
  loadBuiltinCalendar,
  normalize,
  filterReleases,
} from '../../newcar/dataset.js';
import { groupByMonth, groupByDate, computeKpis } from '../../newcar/aggregate.js';
import { api } from '../api.js';
import { showToast } from './toast-store.js';
import { mergeByRemoteFirst } from '../../newcar/merge.js';
import { taggedLog } from '../log.js';

const log = taggedLog('[store/newcar]');
const LS_KEY_UPDATED = 'newcar:lastUpdatedAt';

// 模块级基线: 内置日历 normalize 后副本. 每次刷新都以它为左操作数,
// mergeByRemoteFirst(builtinBaseline, remote) 结果稳定可复现 (幂等基石).
const builtinBaseline = normalize(loadBuiltinCalendar().releases);

// ── signal 槽 ────────────────────────────────────────────
export const newCarReleases = signal([]); // ReleaseRecord[] (已 normalize)
export const newCarFilters = signal({}); // FilterState
export const newCarLoading = signal(false);
export const newCarLastUpdate = signal(null); // epoch ms
export const newCarError = signal(null);
export const newCarNavBadge = signal(0);
export const newCarSelectedDate = signal(null);

let _badgeDismissed = false;
let _subscribed = false;

// ── localStorage 缓存 (仅元数据) ─────────────────────────
function persistLastUpdate(ts) {
  try {
    localStorage.setItem(LS_KEY_UPDATED, String(ts));
  } catch {
    /* ignore (隐私模式等) */
  }
}
function restoreLastUpdate() {
  try {
    const v = localStorage.getItem(LS_KEY_UPDATED);
    return v ? Number(v) || null : null;
  } catch {
    return null;
  }
}

/**
 * 载入内置日历 (离线, esbuild 已打进 bundle). 失败仅记日志不崩.
 */
export function loadCached() {
  newCarLoading.value = true;
  try {
    const ds = loadBuiltinCalendar();
    newCarReleases.value = normalize(ds && ds.releases);
    const ts = Date.now();
    newCarLastUpdate.value = ts;
    persistLastUpdate(ts);
    newCarError.value = null;
  } catch (e) {
    newCarError.value = (e && e.message) || 'load_failed';
    log.warn('loadCached failed:', e && e.message);
  } finally {
    newCarLoading.value = false;
  }
}

/**
 * 手动刷新：主进程拉取远程真源 → 远程优先合并进内置基线 → 写信号 + toast。
 * 失败（网络/超时/解析/异常）时保留当前显示数据，仅置 error + 错误 toast。
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function refresh() {
  newCarLoading.value = true;
  try {
    const res = await api.newcarRefresh?.();
    if (res && res.ok) {
      const merged = mergeByRemoteFirst(builtinBaseline, res.releases || []);
      newCarReleases.value = merged;
      newCarLastUpdate.value = res.fetchedAt;
      newCarError.value = null;
      if (typeof res.fetchedAt === 'number') persistLastUpdate(res.fetchedAt);
      showToast(`已同步最新发布日历（${merged.length} 条）`, 'success');
      return { ok: true };
    }
    // 失败: 保留当前数据, 仅置 error + 错误 toast
    const reason = res?.reason || 'threw';
    newCarError.value = reason;
    showToast(reasonToast(reason), 'error');
    return { ok: false, reason };
  } catch (e) {
    newCarError.value = 'threw';
    showToast(reasonToast('threw'), 'error');
    return { ok: false, reason: 'threw' };
  } finally {
    newCarLoading.value = false;
  }
}

/**
 * 失败原因 → 用户文案（集中映射, 便于统一文案与单测断言）。
 * 空 releases 视为 ok:true → 弹成功 toast (N=基线总数), 不弹错误。
 * @param {string} reason
 * @returns {string}
 */
function reasonToast(reason) {
  switch (reason) {
    case 'no_url':
    case 'network':
      return '无法连接新车数据源，已继续使用内置日历';
    case 'timeout':
      return '连接新车数据源响应超时，已继续使用内置日历';
    case 'parse_failed':
      return '新车数据源返回格式异常，已继续使用内置日历';
    case 'threw':
    default:
      return '刷新新车数据源失败，已继续使用内置日历';
  }
}

export function setFilters(next) {
  newCarFilters.value = next || {};
}
export function setSelectedDate(d) {
  newCarSelectedDate.value = d || null;
}

export function clearNavBadge() {
  _badgeDismissed = true;
  newCarNavBadge.value = 0;
}
export function bumpNavBadge(n = 1) {
  _badgeDismissed = false;
  newCarNavBadge.value += Math.max(1, Number(n) || 1);
}

/** P1: 主进程推送新匹配 → 角标. MVP 预留. */
export function applyEvent(e) {
  if (!e) return;
  if (typeof e.count === 'number') bumpNavBadge(e.count);
}

/**
 * 启动期订阅主进程 push 事件. 幂等.
 * 角标走 ai-usage 同款 sendToRenderer("sidenav:badge", {key:"newcar",count}).
 */
export function subscribeNewCarUpdates() {
  if (_subscribed) return;
  _subscribed = true;
  if (api && typeof api.onSidenavBadge === 'function') {
    api.onSidenavBadge((payload) => {
      if (payload && payload.key === 'newcar') bumpNavBadge(payload.count || 1);
    });
  }
}

/** 初始恢复上次更新时间戳 (进入前也有"X 前"基准). */
export function initNewCarStore() {
  const ts = restoreLastUpdate();
  if (ts) newCarLastUpdate.value = ts;
}

/**
 * 组件内调用的派生 hook. 订阅各 signal, 计算 filtered/kpis/byMonth/byDate.
 * 返回 system_design §3.4 所述结构.
 * @returns {{
 *   releases: import('../../newcar/types.js').ReleaseRecord[],
 *   loading: boolean,
 *   error: string|null,
 *   lastUpdatedAt: number|null,
 *   filters: import('../../newcar/types.js').FilterState,
 *   filtered: import('../../newcar/types.js').ReleaseRecord[],
 *   kpis: import('../../newcar/types.js').Kpis,
 *   byMonth: Map<string, import('../../newcar/types.js').ReleaseRecord[]>,
 *   byDate: Map<string, import('../../newcar/types.js').ReleaseRecord[]>,
 *   navBadge: number,
 *   selectedDate: string|null,
 *   refresh: () => Promise<void>,
 *   setFilters: (next: import('../../newcar/types.js').FilterState) => void,
 *   setSelectedDate: (d: string|null) => void,
 *   clearNavBadge: () => void,
 * }}
 */
export function useNewCarData() {
  const releases = newCarReleases.value;
  const filters = newCarFilters.value;
  const loading = newCarLoading.value;
  const lastUpdatedAt = newCarLastUpdate.value;
  const error = newCarError.value;
  const navBadge = newCarNavBadge.value;
  const selectedDate = newCarSelectedDate.value;

  const filtered = useMemo(() => filterReleases(releases, filters), [releases, filters]);
  const kpis = useMemo(() => computeKpis(releases), [releases]);
  const byMonth = useMemo(() => groupByMonth(releases), [releases]);
  const byDate = useMemo(() => groupByDate(releases), [releases]);

  return {
    releases,
    loading,
    error,
    lastUpdatedAt,
    filters,
    filtered,
    kpis,
    byMonth,
    byDate,
    navBadge,
    selectedDate,
    refresh,
    setFilters,
    setSelectedDate,
    clearNavBadge,
  };
}
