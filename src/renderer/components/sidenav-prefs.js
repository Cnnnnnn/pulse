/**
 * src/renderer/components/sidenav-prefs.js
 *
 * Phase I3 v1: SideNav 重排 + 隐藏的持久化层.
 * Phase I3 v2 (2026-07-10): 加 favorites 字段 (HomeGrid 收藏/置顶用).
 * Phase I3 v3 (2026-07-10): IT 新闻 + 微博热搜 合并 → 'news', 旧 key 迁移.
 *
 * 纯函数模块, 无 React / Preact 依赖. 单源真相: NAV_KEYS 从 navStore.js 导入,
 * 持久化到 renderer localStorage (key = 'pulse.sidenav.prefs.v1').
 *
 * spec: docs/superpowers/specs/2026-06-22-i3-sidenav-drag-hide-design.md §3
 */

import { NAV_KEYS_LIST } from "../worldcup/navStore.js";

const STORAGE_KEY = "pulse.sidenav.prefs.v1";
// v2: 加 favorites 字段. v1 数据兼容 — load 时缺字段补 [].
// v3: 不动 schema — 旧 'ithome' / 'wechat-hot' 在 load 时归一到 'news',
//     保持 order 相对位置. round-trip 后 prefs 干净.
const SCHEMA_VERSION = 2;
const NAV_KEYS = NAV_KEYS_LIST;

// ponytail: v3 迁移 — 旧 'ithome' / 'wechat-hot' 归一到 'news'.
// v4 (2026-07-13): funds + metals + stocks 合并为 'invest' nav, 旧 key 归一到 'invest'.
//   navStore.setActiveNav 也有同名 alias (运行时兼容), 这里负责 prefs 持久化层.
const LEGACY_KEY_ALIAS = {
  ithome: "news",
  "wechat-hot": "news",
  funds: "invest",
  metals: "invest",
  stocks: "invest",
};

/**
 * Build the default prefs from the canonical NAV_KEYS list.
 * 每次返回新对象 — 避免被 caller 修改后污染.
 */
function makeDefault() {
  return {
    version: SCHEMA_VERSION,
    order: NAV_KEYS.slice(),
    hidden: [],
    favorites: [],
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
 *
 * v3 迁移: 旧 key 'ithome' / 'wechat-hot' 归一到 'news', 保持原顺序位置;
 * 防御层: 写入后 setPrefs 触发 savePrefs, 旧 key 会被 alias + filter 双层清洗.
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
    // 清洗 + v3 迁移: order 内 legacy key 归一到 'news' (保持顺序位置);
    // 然后只保留 NAV_KEYS 内的 (alias 之后); 去重.
    const aliasOrder = parsed.order.map((k) => LEGACY_KEY_ALIAS[k] || k);
    const seenOrder = new Set();
    const order = aliasOrder.filter((k) => {
      if (!NAV_KEYS.includes(k) || seenOrder.has(k)) return false;
      seenOrder.add(k);
      return true;
    });
    const seen = new Set();
    const aliasHidden = parsed.hidden.map((k) => LEGACY_KEY_ALIAS[k] || k);
    const hidden = aliasHidden.filter((k) => {
      if (!NAV_KEYS.includes(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // v2: favorites 容错 — v1 数据没这字段 → 默认空数组.
    const seenFav = new Set();
    const aliasFavs = (parsed.favorites || []).map((k) => LEGACY_KEY_ALIAS[k] || k);
    const favorites = Array.isArray(parsed.favorites)
      ? aliasFavs.filter((k) => {
          if (!NAV_KEYS.includes(k) || seenFav.has(k)) return false;
          seenFav.add(k);
          return true;
        })
      : [];
    return { version: SCHEMA_VERSION, order, hidden, favorites };
  } catch {
    return makeDefault();
  }
}

/**
 * 持久化 prefs. 失败 console.warn 不抛.
 *
 * **不**补全 order 缺的 key — round-trip 语义 (save 后 load 应当完全还原).
 * 补全由 effectiveVisibleItems (navStore.js) 在消费时做.
 *
 * v3: 写入前 alias 旧 key → 'news', 防止保存 prefs 重新脏化 (即使 UI 已经 alias 过).
 */
export function savePrefs(prefs) {
  const orderAlias = (Array.isArray(prefs?.order) ? prefs.order : NAV_KEYS.slice())
    .map((k) => LEGACY_KEY_ALIAS[k] || k)
    .filter((k) => NAV_KEYS.includes(k));
  const hiddenAlias = (Array.isArray(prefs?.hidden) ? prefs.hidden : [])
    .map((k) => LEGACY_KEY_ALIAS[k] || k)
    .filter((k) => NAV_KEYS.includes(k));
  const favAlias = (Array.isArray(prefs?.favorites) ? prefs.favorites : [])
    .map((k) => LEGACY_KEY_ALIAS[k] || k)
    .filter((k) => NAV_KEYS.includes(k));
  const out = {
    version: SCHEMA_VERSION,
    order: orderAlias,
    hidden: hiddenAlias,
    favorites: favAlias,
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
 * 兜底: order 漏掉的 known key 也视为可见 — 跟 effectiveVisibleItems (navStore.js) 口径一致,
 * 否则老版本升级后 (新增 nav 项) prefs.order 仍是旧 subset, listVisible 会把它算成隐藏,
 * 但 effectiveVisibleItems 兜底追加让它可见, 两侧矛盾 → SideNav 底部 "已隐藏 (N)" 误报.
 */
export function listVisible(prefs) {
  const order =
    prefs && Array.isArray(prefs.order) && prefs.order.length > 0
      ? prefs.order
      : NAV_KEYS.slice();
  const hidden = new Set((prefs && prefs.hidden) || []);
  const visible = new Set(order.filter((k) => !hidden.has(k)));
  for (const k of NAV_KEYS) {
    if (!visible.has(k) && !hidden.has(k)) visible.add(k);
  }
  return Array.from(visible);
}

/**
 * 隐藏列表: NAV_KEYS 中 prefs.hidden 标记的项. 按 NAV_KEYS 默认顺序, 不按 prefs.order.
 * (隐藏抽屉应当稳定顺序, 不被用户对可见项的拖拽影响.)
 *
 * ponytail: 这里只看 prefs.hidden, 不看 listVisible — 跟 effectiveVisibleItems 兜底逻辑一致,
 * 老版本升级产生的 order 缺项不算"被隐藏".
 */
export function listHidden(prefs) {
  const hidden = new Set((prefs && prefs.hidden) || []);
  return NAV_KEYS.filter((k) => hidden.has(k));
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

/**
 * v2 — 收藏 (favorites) 操作
 *  - toggleFavorite: 已收藏则移除, 未收藏则加到末尾. 幂等.
 *  - listFavorites: 返回 favorites 数组 (清洗: 移除不在 NAV_KEYS 里的).
 *  - isFavorite: 简单 contains.
 *
 * 设计: 收藏与 order 解耦. order 决定 SideNav 列表顺序, favorites
 * 决定 HomeGrid 收藏角标. 即用户可能某个 nav 排在第 5 但收藏了,
 * 或者顺序拖到第 1 但没收藏 — 两个维度独立.
 */
export function toggleFavorite(prefs, key) {
  if (!NAV_KEYS.includes(key)) return prefs;
  const cur = Array.isArray(prefs.favorites) ? prefs.favorites : [];
  const idx = cur.indexOf(key);
  if (idx >= 0) {
    return { ...prefs, favorites: cur.filter((k) => k !== key) };
  }
  return { ...prefs, favorites: [...cur, key] };
}

export function listFavorites(prefs) {
  const f = Array.isArray(prefs?.favorites) ? prefs.favorites : [];
  return f.filter((k) => NAV_KEYS.includes(k));
}

export function isFavorite(prefs, key) {
  return listFavorites(prefs).includes(key);
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