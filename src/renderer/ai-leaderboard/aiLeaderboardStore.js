/**
 * src/renderer/ai-leaderboard/aiLeaderboardStore.js
 *
 * 渲染层状态 (signals) —— 单一真相：
 *   当前 (category, dimension, vendor, sortDir, search) 驱动一次 getLeaderboard 请求
 *   + 本地多维度筛选 / 排序派生（见架构 §1：渲染层只做多维度筛选与展示）。
 *
 * 设计要点（镜像 games/gamesStore.js）：
 *  - 竞态 token 防旧响应覆盖新状态；
 *  - batch() 合并写入避免整页多次重渲；
 *  - 视图偏好持久化到 localStorage（pulse.aiLeaderboard.*.v1）；
 *  - 严守「渲染层不碰网络」：100% 走 api.js → IPC 白名单。
 *
 * 派生策略：
 *  - category / dimension 变化 → 重新请求主进程（board 与排序字段可能变化）；
 *  - vendor / sortDir / search → 纯本地派生，不重发 IPC、不闪 skeleton（同 games）。
 */

import { signal, batch } from "@preact/signals";
import { api } from "../api.js";
import {
  CATEGORY_META,
  DIMENSION_META,
  VENDOR_META,
  normalizeBoardResult,
} from "./types.js";
import { primaryValue } from "./format.js";

/* ── signals ── */
export const activeCategory = signal("llm");
export const activeDimension = signal("elo");
export const activeVendor = signal("all");
export const sortDir = signal("desc");
export const searchQuery = signal("");

export const items = signal([]);
export const sources = signal({});
export const attribution = signal([]);
export const loading = signal(false);
export const error = signal(null);
export const stale = signal(false);
export const fromCache = signal(false);
export const fetchedAt = signal(null);
/** 整份榜单是否回退到示例数据（驱动页头「示例」徽标）。 */
export const isSample = signal(false);

let _reqToken = 0;

/* ── localStorage 偏好（pulse.aiLeaderboard.*.v1）── */
const PREFS_KEY = "pulse.aiLeaderboard.prefs.v1";

export function readStorage(key) {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key, val) {
  try {
    globalThis.localStorage.setItem(key, val);
  } catch {
    /* 配额超限或不可用，忽略 */
  }
}

/** 载入持久化视图偏好（损坏数据忽略，回退默认）。 */
export function loadPrefs() {
  const raw = readStorage(PREFS_KEY);
  if (!raw) return;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.category === "string" && CATEGORY_META[o.category]) {
      activeCategory.value = o.category;
    }
    if (o && typeof o.dimension === "string" && DIMENSION_META[o.dimension]) {
      activeDimension.value = o.dimension;
    }
    if (o && typeof o.vendor === "string") {
      activeVendor.value = o.vendor;
    }
    if (o && (o.sortDir === "asc" || o.sortDir === "desc")) {
      sortDir.value = o.sortDir;
    }
  } catch {
    /* 忽略 */
  }
}

function persistPrefs() {
  try {
    writeStorage(
      PREFS_KEY,
      JSON.stringify({
        category: activeCategory.value,
        dimension: activeDimension.value,
        vendor: activeVendor.value,
        sortDir: sortDir.value,
      }),
    );
  } catch {
    /* 忽略 */
  }
}

/* ── 请求（竞态保护 + batch 写入）── */
async function _run(force) {
  const token = ++_reqToken;
  loading.value = true;
  error.value = null;
  const opts = {
    category: activeCategory.value,
    dimension: activeDimension.value,
    vendor: activeVendor.value,
    force: !!force,
  };
  try {
    const res = force
      ? await api.refreshLeaderboard(opts)
      : await api.getLeaderboard(opts);
    if (token !== _reqToken) return; // 已被更新的请求取代
    const norm = normalizeBoardResult(res);
    batch(() => {
      if (norm.ok) {
        items.value = norm.items;
        sources.value = norm.sources;
        attribution.value = norm.attribution;
        stale.value = norm.stale;
        fromCache.value = norm.fromCache;
        fetchedAt.value = norm.fetchedAt;
        isSample.value =
          Object.values(norm.sources || {}).includes("sample") ||
          (norm.items || []).some((it) => it && it.isSample);
        error.value = null;
      } else {
        error.value = norm.error || "加载失败";
        items.value = [];
        sources.value = {};
        attribution.value = [];
      }
    });
  } catch (e) {
    if (token !== _reqToken) return;
    batch(() => {
      error.value = e && e.message ? e.message : "网络错误";
      items.value = [];
      sources.value = {};
      attribution.value = [];
    });
  } finally {
    if (token === _reqToken) loading.value = false;
  }
}

export function loadLeaderboard() {
  return _run(false);
}

export function refresh() {
  return _run(true);
}

/* ── actions ── */
/** 切分类 Tab：board 变化 → 重新请求。 */
export function setCategory(c) {
  if (!CATEGORY_META[c]) return undefined;
  if (c === activeCategory.value) return undefined;
  activeCategory.value = c;
  persistPrefs();
  return loadLeaderboard();
}

/** 切维度：排序字段变化 → 重新请求（与架构时序图一致）。 */
export function setDimension(d) {
  if (!DIMENSION_META[d]) return undefined;
  if (d === activeDimension.value) return undefined;
  activeDimension.value = d;
  persistPrefs();
  return loadLeaderboard();
}

/** 切厂商：纯本地派生（渲染层多维度筛选，见架构 §1），不重发 IPC。 */
export function setVendor(v) {
  const allowed = v === "all" || VENDOR_META[v];
  activeVendor.value = allowed ? v : "all";
  persistPrefs();
}

/** 切排序方向：纯本地派生（desc 默认），不重发 IPC。 */
export function setSortDir(dir) {
  const d = dir === "asc" ? "asc" : "desc";
  if (d === sortDir.value) return;
  sortDir.value = d;
  persistPrefs();
}

let _searchTimer = null;
/** 200ms 防抖写入 searchQuery，避免逐字重渲整表。 */
export function setSearchQuery(v) {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    searchQuery.value = v || "";
  }, 200);
}

/** 立即清空搜索（清除按钮 / Esc）。 */
export function clearSearchQuery() {
  if (_searchTimer) clearTimeout(_searchTimer);
  searchQuery.value = "";
}

/* ── 纯函数：排序 / 筛选（导出供组件与单测复用）── */

/** 提取某模型在指定维度下的排序值（null = 无数据，恒置末尾）。 */
export function sortValue(model, dimension, category) {
  return primaryValue(model, dimension, category);
}

/**
 * 按维度 + 方向本地排序（不依赖主进程返回顺序）。
 * @param {Array} list
 * @param {{dimension?:string, category?:string, dir?:string}} [opts]
 * @returns {Array}
 */
export function sortModels(list, opts = {}) {
  const dimension = opts.dimension || "elo";
  const category = opts.category || "llm";
  const dir = opts.dir === "asc" ? "asc" : "desc";
  const arr = Array.isArray(list) ? list.slice() : [];
  const mult = dir === "asc" ? 1 : -1;
  arr.sort((a, b) => {
    const va = sortValue(a, dimension, category);
    const vb = sortValue(b, dimension, category);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // null 恒置末尾
    if (vb == null) return -1;
    return (va - vb) * mult;
  });
  return arr;
}

/** 厂商筛选（'all' 或非法 → 不过滤）。 */
export function filterByVendor(list, vendor) {
  if (!vendor || vendor === "all") return list;
  return (Array.isArray(list) ? list : []).filter((it) => it && it.vendor === vendor);
}

/** 标题 / 厂商搜索（不区分大小写，本地派生）。 */
export function filterBySearch(list, q) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return list;
  return (Array.isArray(list) ? list : []).filter((it) => {
    const vendorLabel = (VENDOR_META[it.vendor] || {}).label || "";
    const hay = [it.name, it.vendor, vendorLabel].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(needle);
  });
}

/** 组合派生：vendor → search → sort（供 Page 渲染）。 */
export function getDisplayed() {
  let rows = filterByVendor(items.value, activeVendor.value);
  rows = filterBySearch(rows, searchQuery.value);
  rows = sortModels(rows, {
    dimension: activeDimension.value,
    category: activeCategory.value,
    dir: sortDir.value,
  });
  return rows;
}

/* ── 派生判定（页头徽标 / 脚注）── */
export function hasSampleSource() {
  const s = sources.value || {};
  if (Object.values(s).includes("sample")) return true;
  return (items.value || []).some((it) => it && it.isSample);
}

export function isAllSample() {
  const list = items.value;
  return Array.isArray(list) && list.length > 0 && list.every((it) => it && it.isSample);
}

export function hasAttribution(id) {
  return (attribution.value || []).some((a) => a && a.id === id);
}

/** 派生展示列表别名（Page 直接调用 deriveShown()）。 */
export function deriveShown() {
  return getDisplayed();
}
