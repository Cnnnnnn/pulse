/**
 * src/renderer/components/sidenav-prefs.js
 *
 * Phase I3 v1: SideNav 拖拽重排 + 隐藏的纯函数模块.
 * 无 React 依赖, 无副作用注入; 所有改动通过 export 的函数.
 *
 * 持久化: localStorage['pulse.sidenav.prefs.v1']
 *   {
 *     version: 1,
 *     order: string[],   // 用户拖拽后的 nav key 顺序
 *     hidden: string[],   // 用户隐藏的 nav key
 *   }
 *
 * 设计约束:
 *   - 不动 activeNav / navCollapsed / installNavWatch (spec §2.3)
 *   - 不动 main 进程 / IPC / state.json (spec §2.4)
 *   - 零新依赖 (spec §1)
 *   - savePrefs 失败 → console.warn, 不抛 (spec §3.4)
 */

import { NAV_KEYS_LIST } from "../worldcup/navStore.js";

const STORAGE_KEY = "pulse.sidenav.prefs.v1";
const SCHEMA_VERSION = 1;

const DEFAULTS = Object.freeze({
  version: SCHEMA_VERSION,
  order: NAV_KEYS_LIST.slice(),
  hidden: [],
});

/**
 * 读 prefs. localStorage 损坏 / version 不匹配 → 返 DEFAULTS (深拷贝).
 */
export function loadPrefs() {
  try {
    if (typeof localStorage === "undefined") return clone(DEFAULTS);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SCHEMA_VERSION) return clone(DEFAULTS);
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter((k) => typeof k === "string" && NAV_KEYS_LIST.includes(k))
      : NAV_KEYS_LIST.slice();
    const hidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((k) => typeof k === "string" && NAV_KEYS_LIST.includes(k))
      : [];
    return { version: SCHEMA_VERSION, order, hidden };
  } catch (err) {
    console.warn(`sidenav-prefs.loadPrefs: ${err && err.message}; using defaults`);
    return clone(DEFAULTS);
  }
}

/**
 * 写 prefs. 失败 console.warn, 不抛.
 */
export function savePrefs(prefs) {
  try {
    if (typeof localStorage === "undefined") {
      console.warn("sidenav-prefs.savePrefs: localStorage unavailable, prefs not persisted");
      return false;
    }
    const normalized = {
      version: SCHEMA_VERSION,
      order: Array.isArray(prefs?.order) ? prefs.order.slice() : NAV_KEYS_LIST.slice(),
      hidden: Array.isArray(prefs?.hidden) ? prefs.hidden.slice() : [],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch (err) {
    console.warn(`sidenav-prefs.savePrefs: ${err && err.message}`);
    return false;
  }
}

/** 按 prefs.order 排序, 排除 hidden. */
export function listVisible(prefs) {
  const p = prefs || DEFAULTS;
  const order = Array.isArray(p.order) && p.order.length > 0 ? p.order : NAV_KEYS_LIST;
  const hidden = new Set(Array.isArray(p.hidden) ? p.hidden : []);
  const out = [];
  for (const k of order) {
    if (!hidden.has(k) && NAV_KEYS_LIST.includes(k)) out.push(k);
  }
  return out;
}

/** NAV_KEYS_LIST - visible. */
export function listHidden(prefs) {
  const visible = new Set(listVisible(prefs));
  return NAV_KEYS_LIST.filter((k) => !visible.has(k));
}

/** 加 key 到 hidden (幂等). 返新 prefs. */
export function hideItem(prefs, key) {
  if (!NAV_KEYS_LIST.includes(key)) return prefs;
  const p = clone(prefs || DEFAULTS);
  if (!p.hidden.includes(key)) p.hidden.push(key);
  return p;
}

/** 从 hidden 移除 (幂等). 返新 prefs. */
export function restoreItem(prefs, key) {
  const p = clone(prefs || DEFAULTS);
  p.hidden = p.hidden.filter((k) => k !== key);
  return p;
}

/**
 * 把 fromKey 移到 toKey 的 position 位置.
 * position: 'before' (到 to 之前) | 'after' (到 to 之后).
 * from === to → noop, 返 prefs 同 ref.
 */
export function reorderItems(prefs, fromKey, toKey, position = "before") {
  if (fromKey === toKey) return prefs;
  const p = clone(prefs || DEFAULTS);
  const order = p.order.slice();
  const fromIdx = order.indexOf(fromKey);
  const toIdx = order.indexOf(toKey);
  if (fromIdx < 0 || toIdx < 0) return p;
  const moved = order[fromIdx];
  order.splice(fromIdx, 1);
  // splice 后索引变化: to > from 时 to 实际位置左移 1
  const adjustedTo = toIdx > fromIdx ? toIdx - 1 : toIdx;
  const insertAt = position === "after" ? adjustedTo + 1 : adjustedTo;
  order.splice(insertAt, 0, moved);
  p.order = order;
  return p;
}

/** 重置到 defaults (用于测试). */
export function resetPrefs() {
  return clone(DEFAULTS);
}

/** 测试用: 拿到 storage key (避免硬编码). */
export const STORAGE_KEY_FOR_TESTS = STORAGE_KEY;
export const DEFAULTS_FOR_TESTS = DEFAULTS;

function clone(obj) {
  return {
    version: obj.version,
    order: obj.order.slice(),
    hidden: obj.hidden.slice(),
  };
}