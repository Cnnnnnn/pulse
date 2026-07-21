/**
 * src/renderer/ai-leaderboard/aiLeaderboardStore.js
 *
 * v3.0 重设计：双视角状态模型。
 *
 * 状态：
 *   activeView   — "arena" | "aa"
 *   activeBoard  — Arena 视角子筛选 ("text" | "vision" | "code")
 *   activeDim    — AA 视角排序维度 ("intelligence" | "coding" | ...)
 *   activeVendor — 厂商筛选
 *   sortDir      — 排序方向
 *   searchQuery  — 搜索
 *
 * 派生策略：
 *  - view / board / dim 变化 → 重新请求主进程（映射为 IPC category+dimension）；
 *  - vendor / sortDir / search → 纯本地派生，不重发 IPC。
 */

import { signal, batch } from "@preact/signals";
import { api } from "../api.js";
import {
  VIEWS,
  ARENA_BOARDS,
  AA_DIMENSIONS,
  LIVE_DIMENSIONS,
  ASC_DEFAULT_DIMS,
  VENDOR_META,
  toIpcParams,
  normalizeBoardResult,
} from "./types.js";
import { primaryValue, licenseKind } from "./format.js";

/* ── signals ── */
export const activeView = signal("arena");
export const activeBoard = signal("text");
export const activeDim = signal("intelligence");
export const activeLB = signal("lb_overall");
export const activeVendor = signal("all");
export const sortDir = signal("desc");
/** 列头点选排序：null = 按当前视角主维度（active dim/board），否则按指定列 key 排。 */
export const sortKey = signal(null);
export const searchQuery = signal("");

/** 许可筛选：all | open | proprietary（基于 license 字符串粗判）。 */
export const licenseFilter = signal("all");

/** 模型对比列表（最多 3 个 id）。 */
export const compareList = signal([]);

export function toggleCompare(id) {
  const list = compareList.value;
  if (list.includes(id)) {
    compareList.value = list.filter((x) => x !== id);
  } else if (list.length < 3) {
    compareList.value = [...list, id];
  }
}

export function clearCompare() {
  compareList.value = [];
}

export const items = signal([]);
export const sources = signal({});
export const sourceCoverage = signal({ arena: 0, aa: 0, openrouter: 0, livebench: 0 });
export const attribution = signal([]);
export const loading = signal(false);
export const error = signal(null);
export const stale = signal(false);
export const fromCache = signal(false);
export const fetchedAt = signal(null);
/** 上游 Arena 快照的真实数据截止日期（boards[*].meta.last_updated），如 "Jul 16, 2026"。 */
export const sourceDate = signal(null);
export const isSample = signal(false);

let _reqToken = 0;

/* ── localStorage 偏好 ── */
const PREFS_KEY = "pulse.aiLeaderboard.prefs.v3";

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
  } catch { /* 忽略 */ }
}

export function loadPrefs() {
  const raw = readStorage(PREFS_KEY);
  if (!raw) return;
  try {
    const o = JSON.parse(raw);
    if (o && VIEWS[o.view]) activeView.value = o.view;
    if (o && ARENA_BOARDS[o.board]) activeBoard.value = o.board;
    if (o && AA_DIMENSIONS[o.dim]) activeDim.value = o.dim;
    if (o && LIVE_DIMENSIONS[o.lb]) activeLB.value = o.lb;
    if (o && typeof o.vendor === "string") activeVendor.value = o.vendor;
    if (o && ["all", "open", "proprietary"].includes(o.license)) licenseFilter.value = o.license;
    if (o && (o.sortDir === "asc" || o.sortDir === "desc")) sortDir.value = o.sortDir;
  } catch { /* 忽略 */ }
}

function persistPrefs() {
  try {
    writeStorage(
      PREFS_KEY,
      JSON.stringify({
        view: activeView.value,
        board: activeBoard.value,
        dim: activeDim.value,
        lb: activeLB.value,
        vendor: activeVendor.value,
        license: licenseFilter.value,
        sortDir: sortDir.value,
      }),
    );
  } catch { /* 忽略 */ }
}

/* ── 请求（竞态保护 + batch 写入）── */
async function _run(force) {
  const token = ++_reqToken;
  loading.value = true;
  error.value = null;

  const subFilter =
    activeView.value === "arena"
      ? activeBoard.value
      : activeView.value === "livebench"
      ? activeLB.value
      : activeDim.value;
  const { category, dimension } = toIpcParams(activeView.value, subFilter);
  // ponytail: 独立数据源管控 — 每个 tab 只拉自己主源 + openrouter 兜底.
  // 升级路径: 用户手动选「同时看 AA+LB」可加 toggle (caller 拼多个 sourceKey).
  const view = activeView.value;
  const sources = {
    arena: view === "arena",
    aa: view === "aa",
    livebench: view === "livebench",
    openrouter: true, // 任何 view 都拉, 用作"目录骨架" / 厂商匹配
  };
  const opts = { category, dimension, vendor: activeVendor.value, force: !!force, sources };

  try {
    const res = force
      ? await api.refreshLeaderboard(opts)
      : await api.getLeaderboard(opts);
    if (token !== _reqToken) return;
    const norm = normalizeBoardResult(res);
    batch(() => {
      if (norm.ok) {
        items.value = norm.items;
        sources.value = norm.sources;
        sourceCoverage.value = norm.sourceCoverage || { arena: 0, aa: 0, openrouter: 0, livebench: 0 };
        attribution.value = norm.attribution;
        stale.value = norm.stale;
        fromCache.value = norm.fromCache;
        fetchedAt.value = norm.fetchedAt;
        sourceDate.value = norm.lastUpdated;
        isSample.value =
          Object.values(norm.sources || {}).includes("sample") ||
          (norm.items || []).some((it) => it && it.isSample);
        error.value = null;
      } else {
        error.value = norm.error || "加载失败";
        items.value = [];
        sources.value = {};
        sourceCoverage.value = { arena: 0, aa: 0, openrouter: 0, livebench: 0 };
        attribution.value = [];
      }
    });
  } catch (e) {
    if (token !== _reqToken) return;
    batch(() => {
      error.value = e && e.message ? e.message : "网络错误";
      items.value = [];
      sources.value = {};
      sourceCoverage.value = { arena: 0, aa: 0, openrouter: 0, livebench: 0 };
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

/** 切换视角（arena ↔ aa）→ 重新请求。 */
export function setView(v) {
  if (!VIEWS[v] || v === activeView.value) return undefined;
  activeView.value = v;
  activeVendor.value = "all";
  compareList.value = [];
  sortKey.value = null;
  sortDir.value = "desc";
  persistPrefs();
  return loadLeaderboard();
}

/** Arena 视角：切 board → 重新请求。 */
export function setBoard(b) {
  if (!ARENA_BOARDS[b] || b === activeBoard.value) return undefined;
  activeBoard.value = b;
  activeVendor.value = "all";
  sortKey.value = null;
  persistPrefs();
  return loadLeaderboard();
}

/** AA 视角：切排序维度 → 重新请求。 */
export function setDim(d) {
  if (!AA_DIMENSIONS[d] || d === activeDim.value) return undefined;
  activeDim.value = d;
  activeVendor.value = "all";
  sortKey.value = null;
  sortDir.value = ASC_DEFAULT_DIMS.has(d) ? "asc" : "desc";
  persistPrefs();
  return loadLeaderboard();
}

/** LiveBench 视角：切子维度 → 重新请求。全部 desc 默认, 不动 sortDir 现状。 */
export function setLB(d) {
  if (!LIVE_DIMENSIONS[d] || d === activeLB.value) return undefined;
  activeLB.value = d;
  activeVendor.value = "all";
  sortKey.value = null;
  persistPrefs();
  return loadLeaderboard();
}

/** 切厂商：纯本地派生。 */
export function setVendor(v) {
  const allowed = v === "all" || VENDOR_META[v];
  activeVendor.value = allowed ? v : "all";
  persistPrefs();
}

export function setLicenseFilter(v) {
  const allowed = ["all", "open", "proprietary"].includes(v);
  licenseFilter.value = allowed ? v : "all";
  persistPrefs();
}

/** 切排序方向：纯本地派生。 */
export function setSortDir(dir) {
  const d = dir === "asc" ? "asc" : "desc";
  if (d === sortDir.value) return;
  sortDir.value = d;
  persistPrefs();
}

let _searchTimer = null;
export function setSearchQuery(v) {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    searchQuery.value = v || "";
  }, 200);
}

export function clearSearchQuery() {
  if (_searchTimer) clearTimeout(_searchTimer);
  searchQuery.value = "";
}

/* ── 纯函数：排序 / 筛选 ── */

/**
 * 取模型在指定视角下「某一列」的原始数值（用于列头点选排序）。
 * 覆盖所有可排序列，包括 primaryValue 未涵盖的 valueRatio / ci / lb_cost。
 * @returns {number|null}
 */
export function columnValue(model, view, key) {
  if (view === "arena") {
    if (key === "elo" || key === "ci" || key === "votes") {
      const board = ARENA_BOARDS[activeBoard.value] || ARENA_BOARDS.text;
      const slice = model && model.arena && model.arena[board.key];
      if (!slice) return null;
      if (key === "elo") return typeof slice.score === "number" ? slice.score : null;
      if (key === "ci") return slice.ci != null ? slice.ci : null;
      return slice.votes != null ? slice.votes : null;
    }
    return null;
  }
  if (view === "livebench") {
    const lb = model && model.livebench;
    if (!lb) return null;
    if (key === "lb_overall") return typeof lb.overall === "number" ? lb.overall : null;
    if (key === "lb_cost") {
      const c = lb.cost && lb.cost.perSuccessfulTask;
      return typeof c === "number" ? c : null;
    }
    const cat = { lb_coding: "Coding", lb_language: "Language", lb_instfollow: "IF" }[key];
    if (cat) {
      const v = lb.byCategory && lb.byCategory[cat];
      return typeof v === "number" ? v : null;
    }
    return null;
  }
  const aa = model && model.aa;
  if (!aa) return null;
  switch (key) {
    case "intelligence": return aa.intelligenceIndex ?? null;
    case "coding": return aa.codingIndex ?? null;
    case "agentic": return aa.agenticIndex ?? null;
    case "speed": return aa.outputTokensPerSec ?? null;
    case "price": return aa.priceOutputPer1M ?? null;
    case "valueRatio":
      return aa.intelligenceIndex != null && aa.priceOutputPer1M > 0
        ? aa.intelligenceIndex / aa.priceOutputPer1M
        : null;
    default: return null;
  }
}

/** 提取模型在当前视角下的排序值（sortKey 优先，否则走当前主维度）。 */
export function sortValue(model) {
  const key = sortKey.value;
  if (key) return columnValue(model, activeView.value, key);
  if (activeView.value === "arena") {
    const board = ARENA_BOARDS[activeBoard.value] || ARENA_BOARDS.text;
    return primaryValue(model, "elo", board.category);
  }
  if (activeView.value === "livebench") {
    return primaryValue(model, activeLB.value, "llm");
  }
  return primaryValue(model, activeDim.value, "llm");
}

/** 越低越优的列（点选时默认升序）。 */
const ASC_DEFAULT_COLS = new Set(["price", "speed", "lb_cost"]);

/**
 * 列头点选排序：
 *  - 点同一列 → 切换升/降序；
 *  - 点不同列 → 设为该列，并按 better 方向给默认序（低优列 asc，其余 desc）。
 */
export function toggleSort(key) {
  if (!key) return;
  if (sortKey.value === key) {
    setSortDir(sortDir.value === "asc" ? "desc" : "asc");
  } else {
    sortKey.value = key;
    sortDir.value = ASC_DEFAULT_COLS.has(key) ? "asc" : "desc";
    // ponytail: 与表头排序对齐偏好里的主维度，避免删掉工具栏下拉后刷新又回默认序
    if (activeView.value === "aa" && AA_DIMENSIONS[key]) activeDim.value = key;
    if (activeView.value === "livebench" && LIVE_DIMENSIONS[key]) activeLB.value = key;
    persistPrefs();
  }
}

export function sortModels(list, opts = {}) {
  const dir = opts.dir || sortDir.value;
  const arr = Array.isArray(list) ? list.slice() : [];
  const mult = dir === "asc" ? 1 : -1;
  arr.sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * mult;
  });
  return arr;
}

export function filterByVendor(list, vendor) {
  if (!vendor || vendor === "all") return list;
  return (Array.isArray(list) ? list : []).filter((it) => it && it.vendor === vendor);
}

export function filterByLicense(list, kind) {
  if (!kind || kind === "all") return list;
  return (Array.isArray(list) ? list : []).filter((it) => licenseKind(it.license) === kind);
}

export function filterBySearch(list, q) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return list;
  return (Array.isArray(list) ? list : []).filter((it) => {
    const vendorLabel = (VENDOR_META[it.vendor] || {}).label || "";
    const hay = [it.name, it.vendor, vendorLabel].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(needle);
  });
}

/** 组合派生：视角过滤 → vendor → search → sort。 */
export function getDisplayed() {
  let rows = items.value;
  // Arena 视角：仅保留有 ELO 分数的模型（排除 AA/OR 骨架）
  if (activeView.value === "arena") {
    const board = ARENA_BOARDS[activeBoard.value] || ARENA_BOARDS.text;
    rows = rows.filter((it) => {
      const slice = it && it.arena && it.arena[board.key];
      return slice && typeof slice.score === "number";
    });
  }
  // LiveBench 视角：仅保留 overall 有数据的行（其他 lb_* 列允许空）
  if (activeView.value === "livebench") {
    rows = rows.filter((it) => {
      const lb = it && it.livebench;
      return lb && typeof lb.overall === "number";
    });
  }
  rows = filterByVendor(rows, activeVendor.value);
  rows = filterByLicense(rows, licenseFilter.value);
  rows = filterBySearch(rows, searchQuery.value);
  rows = sortModels(rows, { dir: sortDir.value });
  return rows;
}

/* ── 派生判定 ── */
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

export function deriveShown() {
  return getDisplayed();
}
