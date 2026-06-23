/**
 * src/renderer/components/sidenav-prefs.js
 *
 * Phase I3 v1: SideNav 重排 + 隐藏的持久化层.
 *
 * 纯函数模块, 无 React / Preact 依赖. 单源真相: NAV_KEYS 从 navStore.js 导入,
 * 持久化到 renderer localStorage (key = 'pulse.sidenav.prefs.v1').
 *
 * spec: docs/superpowers/specs/2026-06-22-i3-sidenav-drag-hide-design.md §3
 */

import { NAV_KEYS_LIST } from "../worldcup/navStore.js";

const STORAGE_KEY = "pulse.sidenav.prefs.v1";
const SCHEMA_VERSION = 1;
const NAV_KEYS = NAV_KEYS_LIST;

/**
 * Build the default prefs from the canonical NAV_KEYS list.
 * 每次返回新对象 — 避免被 caller 修改后污染.
 */
function makeDefault() {
  return {
    version: SCHEMA_VERSION,
    order: NAV_KEYS.slice(),
    hidden: [],
  };
}

/**
 * 内存 fallback — 当 localStorage 不可用时 (隐私模式 / 抛错),
 * 仍能在当前会话工作, 重启失效但 UX 不卡.
 */
const _memoryFallback = new Map();

function safeStorageRead() {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeStorageWrite(raw) {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      _memoryFallback.set(STORAGE_KEY, raw);
      return true;
    }
    globalThis.localStorage.setItem(STORAGE_KEY, raw);
    return true;
  } catch (err) {
    _memoryFallback.set(STORAGE_KEY, raw);
    return false; // not throw — caller 可能 console.warn
  }
}

/**
 * 加载 prefs. 容错: 不存在 / 损坏 / schema 版本错 → 返 defaults.
 *
 * **不**补全 order 缺的 key — 那是 effectiveVisibleItems (navStore.js) 的责任,
 * 保留 round-trip 语义.
 */
export function loadPrefs() {
  const raw = safeStorageRead() ?? _memoryFallback.get(STORAGE_KEY) ?? null;
  if (!raw) return makeDefault();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return makeDefault();
    if (parsed.version !== SCHEMA_VERSION) return makeDefault();
    if (!Array.isArray(parsed.order)) return makeDefault();
    if (!Array.isArray(parsed.hidden)) return makeDefault();
    // 清洗: order 只保留 NAV_KEYS 内的; hidden 只保留 NAV_KEYS 内的 (且去重).
    const order = parsed.order.filter((k) => NAV_KEYS.includes(k));
    const seen = new Set();
    const hidden = parsed.hidden.filter((k) => {
      if (!NAV_KEYS.includes(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { version: SCHEMA_VERSION, order, hidden };
  } catch {
    return makeDefault();
  }
}

/**
 * 持久化 prefs. 失败 console.warn 不抛.
 *
 * **不**补全 order 缺的 key — round-trip 语义 (save 后 load 应当完全还原).
 * 补全由 effectiveVisibleItems (navStore.js) 在消费时做.
 */
export function savePrefs(prefs) {
  const out = {
    version: SCHEMA_VERSION,
    order: Array.isArray(prefs?.order) ? prefs.order.filter((k) => NAV_KEYS.includes(k)) : NAV_KEYS.slice(),
    hidden: Array.isArray(prefs?.hidden) ? prefs.hidden.filter((k) => NAV_KEYS.includes(k)) : [],
  };
  let raw;
  try {
    raw = JSON.stringify(out);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`sidenav-prefs: JSON.stringify failed: ${err && err.message}`);
    return false;
  }
  const ok = safeStorageWrite(raw);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn("sidenav-prefs: localStorage write failed, using memory fallback");
  }
  return ok ? out : false;
}

/**
 * 可见顺序: 按 prefs.order, 排除 hidden.
 */
export function listVisible(prefs) {
  const order = (prefs && prefs.order) || NAV_KEYS.slice();
  const hidden = new Set((prefs && prefs.hidden) || []);
  return order.filter((k) => !hidden.has(k));
}

/**
 * 隐藏列表: NAV_KEYS 里不在 listVisible 里的项. 按 NAV_KEYS 默认顺序, 不按 prefs.order.
 * (隐藏抽屉应当稳定顺序, 不被用户对可见项的拖拽影响.)
 */
export function listHidden(prefs) {
  const visible = new Set(listVisible(prefs));
  return NAV_KEYS.filter((k) => !visible.has(k));
}

/**
 * Hide one item. 幂等 — 已在 hidden 则不重复.
 */
export function hideItem(prefs, key) {
  if (!NAV_KEYS.includes(key)) return prefs;
  const hidden = new Set(prefs.hidden);
  hidden.add(key);
  return { ...prefs, hidden: Array.from(hidden) };
}

/**
 * Restore one item from hidden.
 */
export function restoreItem(prefs, key) {
  if (!NAV_KEYS.includes(key)) return prefs;
  const hidden = prefs.hidden.filter((k) => k !== key);
  return { ...prefs, hidden };
}

/**
 * 数组元素搬家. spec §3.3.
 *   - from === to: noop (但仍返回新数组避免 caller 误判).
 *   - 'before' = 插到 to 之前; 'after' = 插到 to 之后.
 *   - splice 后索引已经变, 所以 to > from 时 to 要 -1 (原 to 在新数组的位置).
 */
function arrayMove(arr, from, to, position) {
  if (from < 0 || from >= arr.length) return arr.slice();
  if (to < 0 || to >= arr.length) return arr.slice();
  if (from === to) return arr.slice();
  const out = arr.slice();
  const [moved] = out.splice(from, 1);
  const insertAt = (to > from ? to - 1 : to) + (position === "after" ? 1 : 0);
  out.splice(insertAt, 0, moved);
  return out;
}

/**
 * 把 fromKey 移到 toKey 之前/之后. 找不到 key → noop.
 */
export function reorderItems(prefs, fromKey, toKey, position = "before") {
  if (fromKey === toKey) return prefs;
  if (!NAV_KEYS.includes(fromKey) || !NAV_KEYS.includes(toKey)) return prefs;
  const order = prefs.order || NAV_KEYS.slice();
  const from = order.indexOf(fromKey);
  const to = order.indexOf(toKey);
  if (from === -1 || to === -1) return prefs;
  const next = arrayMove(order, from, to, position);
  return { ...prefs, order: next };
}

/**
 * 移到顶部: 重排到 order[0] 之前.
 */
export function moveToTop(prefs, key) {
  if (!NAV_KEYS.includes(key)) return prefs;
  const order = prefs.order || NAV_KEYS.slice();
  const from = order.indexOf(key);
  if (from <= 0) return prefs; // 已在最顶
  return reorderItems(prefs, key, order[0], "before");
}

/**
 * 移到底部: 重排到 order[last] 之后.
 */
export function moveToBottom(prefs, key) {
  if (!NAV_KEYS.includes(key)) return prefs;
  const order = prefs.order || NAV_KEYS.slice();
  const from = order.indexOf(key);
  if (from === order.length - 1) return prefs;
  return reorderItems(prefs, key, order[order.length - 1], "after");
}

// ─── test-only exports (not in spec, but consumed by tests/renderer/sidenav-prefs.test.js) ───

/** Always-fresh default prefs, regardless of localStorage. Test helper. */
export function resetPrefs() {
  return makeDefault();
}

/** localStorage key (test helper). */
export const STORAGE_KEY_FOR_TESTS = STORAGE_KEY;

/** Frozen default prefs snapshot (test helper). */
export const DEFAULTS_FOR_TESTS = Object.freeze({
  version: SCHEMA_VERSION,
  order: Object.freeze(NAV_KEYS.slice()),
  hidden: Object.freeze([]),
});