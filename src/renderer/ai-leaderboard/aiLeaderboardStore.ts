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
import { api } from "../api.ts";
import {
  beginDataRequest,
  createDataState,
  rejectData,
  resolveData,
} from "../../shared/data-state.ts";
import type { DataState, DataSource } from "../../shared/data-state.ts";
import {
  VIEWS,
  ARENA_BOARDS,
  AA_DIMENSIONS,
  LIVE_DIMENSIONS,
  // ponytail: HF 视角 (v2.79.5+) — 共用 activeDim, HF_DIMENSIONS 校验防越界.
  HF_DIMENSIONS,
  ASC_DEFAULT_DIMS,
  VENDOR_META,
  // ponytail: Agent 榜 6 维细分 (v2.8x) — 维度子切换驱动按维排名.
  AGENT_DIMENSIONS,
  AGENT_DIMENSION_DEFAULT,
  // ponytail: 文本榜 category 子榜 (v2.8x) — Overall/Coding/Math/... 本地切换.
  TEXT_CATEGORIES,
  TEXT_CATEGORY_DEFAULT,
  // ponytail: Code 榜 category 子榜 (v2.8x) — WebDev/Image-to-WebDev 本地切换.
  CODE_CATEGORIES,
  CODE_CATEGORY_DEFAULT,
  // ponytail: 5 大类分组 (v2.8x) — 一级大类 → 二级榜.
  ARENA_CATEGORIES,
  boardsOfCategory,
  uiCategoryOfBoard,
  toIpcParams,
  normalizeBoardResult,
} from "./types.ts";
import { primaryValue, licenseKind, computeTrendingScore } from "./format.ts";

/**
 * ponytail: HF 视角 base_model 衍生数 (v2.79.6+) — 一次扫描, 算同 base_model 出现次数.
 * 返回 Map<baseModel, count>. 没 baseModel 的不进 map.
 * @param {object[]} items
 * @returns {Map<string, number>}
 */
export function baseModelCountMap(items: any) {
  const m = new Map();
  if (!Array.isArray(items)) return m;
  for (const it of items) {
    const bm = it && it.huggingface && it.huggingface.baseModel;
    if (!bm || typeof bm !== "string") continue;
    m.set(bm, (m.get(bm) || 0) + 1);
  }
  return m;
}

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

/** 数据健康卡会话级偏好：用户隐藏的 source key 集合（如 {"livebench", "openrouter"}）。
 * 会话内有效，刷新后重置（不持久化）。 */
export const hiddenHealthSources = signal(new Set());

/** Agent 榜当前选中的细分维度（Net Improvement / Confirmed Success / ...）。
 * 仅当 activeBoard==="agent" 时生效，驱动「按维度排名」。纯本地重排，不触发 IPC。 */
export const activeAgentDim = signal(AGENT_DIMENSION_DEFAULT);

/** 文本榜当前选中的 category 子榜（overall / coding / math / hard / instruction_following / non_english）。
 * 仅当 activeBoard==="text" 时生效。纯本地切换（数据已在 categories map 里），不触发 IPC。 */
export const activeTextCat = signal(TEXT_CATEGORY_DEFAULT);

/** Code 榜当前选中的 category 子榜（overall=WebDev / image_to_webdev=Image-to-WebDev）。
 * 仅当 activeBoard==="code" 时生效。纯本地切换，不触发 IPC。 */
export const activeCodeCat = signal(CODE_CATEGORY_DEFAULT);

/** 模型对比列表（最多 3 个 id）。 */
export const compareList = signal([]);

/** 模型详情抽屉：当前展示的模型 id（null = 关闭）。 */
export const detailId = signal(null);

export function toggleCompare(id: any) {
  const list = compareList.value;
  if (list.includes(id)) {
    compareList.value = list.filter((x: any) => x !== id);
  } else if (list.length < 3) {
    compareList.value = [...list, id];
  }
}

export function clearCompare() {
  compareList.value = [];
}

export function openModelDetail(id: any) {
  if (!id) return;
  detailId.value = id;
}

export function closeModelDetail() {
  detailId.value = null;
}

/* ── 跨源雷达：三源联合拉取（arena + aa + livebench 合并）── */
export const crossSourceItems = signal(null);
export const crossSourceLoading = signal(false);
export const crossSourceError = signal(null);
let _csToken = 0;

/** 跨源雷达请求参数：同时拉 arena + aa + livebench（+ openrouter 兜底骨架）。 */
function _crossSourceOpts(force: any) {
  return {
    category: "llm",
    dimension: "elo",
    vendor: "all",
    force: !!force,
    sources: { arena: true, aa: true, livebench: true, openrouter: true, modelsdev: true },
  };
}

/**
 * 触发一次三源联合拉取（未加载或非 force 时不重复发请求）。
 * 结果合并进 crossSourceItems，供跨源雷达在 Arena ELO / AA 智能 / LiveBench
 * 三维叠加同一批模型（mergeModelSlices 已按 id 合并三源切片）。
 */
export async function loadCrossSource(force: any) {
  if (crossSourceItems.value && !force) return;
  const token = ++_csToken;
  crossSourceLoading.value = true;
  crossSourceError.value = null;
  try {
    const res = force
      ? await api.refreshLeaderboard(_crossSourceOpts(true))
      : await api.getLeaderboard(_crossSourceOpts(false));
    if (token !== _csToken) return;
    const norm = normalizeBoardResult(res);
    if (norm.ok) {
      crossSourceItems.value = norm.items;
    } else {
      crossSourceError.value = norm.error || "跨源加载失败";
    }
  } catch (e: any) {
    if (token !== _csToken) return;
    crossSourceError.value = e && e.message ? e.message : "网络错误";
  } finally {
    if (token === _csToken) crossSourceLoading.value = false;
  }
}

export const items = signal([]);
export const sources = signal({});
export const sourceCoverage = signal({
  arena: 0, aa: 0, openrouter: 0, livebench: 0, modelsdev: 0, huggingface: 0,
});
export const attribution = signal([]);
export const loading = signal(false);
export const error = signal(null);
export const aiLeaderboardDataState = signal<DataState<any[]>>(createDataState([]));
export const lastFetchErrors = signal([]);
export const stale = signal(false);
export const fromCache = signal(false);
export const fetchedAt = signal(null);
/** 上游 Arena 快照的真实数据截止日期（boards[*].meta.last_updated），如 "Jul 16, 2026"。 */
export const sourceDate = signal(null);
export const isSample = signal(false);
/** AA 今日速率预算快照（best-effort；失败时保持上次值或默认 0/1000）。 */
export const rateBudget = signal({ used: 0, limit: 1000, remaining: 1000, dayResetsAt: null, lastAcquireAt: null });

function boardTimestamp(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function boardDataSource(norm: any): DataSource {
  if (norm && (norm.stale || norm.fromCache)) return "cache";
  if (norm && Object.values(norm.sources || {}).includes("sample")) return "sample";
  return "live";
}

export async function loadRateBudget() {
  try {
    const b = await api.rateBudget();
    rateBudget.value = b || rateBudget.value;
  } catch {
    /* best-effort */
  }
}

let _reqToken = 0;

/* ── localStorage 偏好 ── */
const PREFS_KEY = "pulse.aiLeaderboard.prefs.v3";

export function readStorage(key: any) {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: any, val: any) {
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
    // ponytail: Agent 维度偏好 (v2.8x) — 仅当 board 是 agent 时恢复，其它 board 忽略越界值.
    if (o && typeof o.agentDim === "string" && AGENT_DIMENSIONS.includes(o.agentDim)) {
      if (activeBoard.value === "agent") activeAgentDim.value = o.agentDim;
    }
    // ponytail: 文本榜 category 偏好 (v2.8x) — 仅当 board 是 text 时恢复.
    if (o && typeof o.textCat === "string" && TEXT_CATEGORIES.some((c: any) => c.key === o.textCat)) {
      if (activeBoard.value === "text") activeTextCat.value = o.textCat;
    }
    // ponytail: Code 榜 category 偏好 (v2.8x) — 仅当 board 是 code 时恢复.
    if (o && typeof o.codeCat === "string" && CODE_CATEGORIES.some((c: any) => c.key === o.codeCat)) {
      if (activeBoard.value === "code") activeCodeCat.value = o.codeCat;
    }
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
        agentDim: activeAgentDim.value,
        textCat: activeTextCat.value,
        codeCat: activeCodeCat.value,
      }),
    );
  } catch { /* 忽略 */ }
}

/* ── 请求（竞态保护 + batch 写入）── */
async function _run(force: any) {
  const token = ++_reqToken;
  loading.value = true;
  error.value = null;
  aiLeaderboardDataState.value = beginDataRequest(aiLeaderboardDataState.value);

  const subFilter =
    activeView.value === "arena"
      ? activeBoard.value
      : activeView.value === "livebench"
      ? activeLB.value
      : activeDim.value;
  const { category, dimension } = toIpcParams(activeView.value, subFilter);
  // ponytail: 独立数据源管控 — 每个 tab 只拉自己主源 + openrouter 兜底.
  // 升级路径: 用户手动选「同时看 AA+LB」可加 toggle (caller 拼多个 sourceKey).
  // v2.79.5+: HF 视角下 huggingface=true 拉 hfFetcher, 其它视角不拉 (openrouter 仍兜底).
  const view = activeView.value;
  // ponytail: 局部 flags 勿命名 sources — 会 shadow 同名 signal
  const sourceFlags = {
    arena: view === "arena",
    aa: view === "aa",
    livebench: view === "livebench",
    huggingface: view === "huggingface",
    modelsdev: true, // 上下文窗口 / 价格等表格元数据，作为轻量补全源保留
    openrouter: true, // 任何 view 都拉, 用作"目录骨架" / 厂商匹配
  };
  const opts = { category, dimension, vendor: activeVendor.value, force: !!force, sources: sourceFlags };

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
        sourceCoverage.value = norm.sourceCoverage || { arena: 0, aa: 0, openrouter: 0, livebench: 0, modelsdev: 0, huggingface: 0 };
        attribution.value = norm.attribution;
        lastFetchErrors.value = norm.errors || [];
        stale.value = norm.stale;
        fromCache.value = norm.fromCache;
        fetchedAt.value = norm.fetchedAt;
        sourceDate.value = norm.lastUpdated;
        isSample.value =
          Object.values(norm.sources || {}).includes("sample") ||
          (norm.items || []).some((it: any) => it && it.isSample);
        aiLeaderboardDataState.value = resolveData(
          aiLeaderboardDataState.value,
          norm.items || [],
          { source: boardDataSource(norm), fetchedAt: boardTimestamp(norm.fetchedAt) },
        );
        error.value = null;
        loadRateBudget();
      } else {
        error.value = norm.error || "加载失败";
        aiLeaderboardDataState.value = rejectData(aiLeaderboardDataState.value, error.value);
        stale.value = aiLeaderboardDataState.value.phase === "stale";
      }
    });
  } catch (e: any) {
    if (token !== _reqToken) return;
    batch(() => {
      error.value = e && e.message ? e.message : "网络错误";
      aiLeaderboardDataState.value = rejectData(aiLeaderboardDataState.value, error.value);
      stale.value = aiLeaderboardDataState.value.phase === "stale";
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

/** 切换视角（arena ↔ aa ↔ huggingface）→ 重新请求。 */
export function setView(v: any) {
  if (!VIEWS[v] || v === activeView.value) return undefined;
  activeView.value = v;
  activeVendor.value = "all";
  compareList.value = [];
  sortKey.value = null;
  sortDir.value = "desc";
  // ponytail: HF 视角 (v2.79.5+) — 切到 HF 时重置 activeDim 到 hf_downloads 兜底.
  if (v === "huggingface" && !HF_DIMENSIONS[activeDim.value]) activeDim.value = "hf_downloads";
  // ponytail: 从 HF 切回 AA 时 activeDim 可能仍是 hf_*，须复位否则 getDisplayed 全空。
  if (v === "aa" && !AA_DIMENSIONS[activeDim.value]) activeDim.value = "intelligence";
  persistPrefs();
  return loadLeaderboard();
}

/** Arena 视角：切 board → 重新请求。 */
export function setBoard(b: any) {
  if (!ARENA_BOARDS[b] || b === activeBoard.value) return undefined;
  activeBoard.value = b;
  activeVendor.value = "all";
  sortKey.value = null;
  // ponytail: 切到 Agent 榜时把维度复位到头条（Net Improvement）；切走则保持默认。
  if (b === "agent") activeAgentDim.value = AGENT_DIMENSION_DEFAULT;
  // ponytail: 切到文本榜时把 category 复位到 overall；切走则保持默认。
  if (b === "text") activeTextCat.value = TEXT_CATEGORY_DEFAULT;
  if (b === "code") activeCodeCat.value = CODE_CATEGORY_DEFAULT;
  persistPrefs();
  return loadLeaderboard();
}

/** Arena 视角：切一级大类（llm/multimodal/code/image/video）。
 * 大类本身不单独请求——切到该类下的默认 board（或保持当前 board 若已在该类），
 * 由 setBoard 触发 reload。 */
export function setCategory(cat: any) {
  const boards = boardsOfCategory(cat);
  if (!boards.length) return undefined;
  const cur = activeBoard.value;
  // 当前 board 已属该 UI 大类 → 仅切选中态，不重发请求
  if (uiCategoryOfBoard(cur) === cat) return undefined;
  return setBoard(boards[0]);
}

/** 当前激活的 UI 大类 key（由 activeBoard 派生，便于 FilterBar 渲染选中态）。 */
export function activeCategory() {
  return uiCategoryOfBoard(activeBoard.value);
}

/** Agent 榜：切细分维度 → 纯本地重排（数据已加载，不触发 IPC）。
 * 该维度成为主指标列与排序依据（"按维度排名"，呼应 arena.ai 官网）。 */
export function setAgentDim(d: any) {
  if (!AGENT_DIMENSIONS.includes(d) || d === activeAgentDim.value) return undefined;
  activeAgentDim.value = d;
  sortKey.value = null; // 让 sortValue 走 agent 维度分支
  persistPrefs();
  return undefined;
}

/** 文本榜：切 category 子榜 → 纯本地切换（数据已在 categories map 里，不触发 IPC）。
 * 该 category 成为主指标列与排序/过滤依据（呼应 arena.ai 文本榜的 Overall/Coding/... 子榜）。 */
export function setTextCat(cat: any) {
  if (!TEXT_CATEGORIES.some((c: any) => c.key === cat) || cat === activeTextCat.value) return undefined;
  activeTextCat.value = cat;
  sortKey.value = null;
  persistPrefs();
  return undefined;
}

/** Code 榜：切 category 子榜 → 纯本地切换（WebDev / Image-to-WebDev），不触发 IPC。 */
export function setCodeCat(cat: any) {
  if (!CODE_CATEGORIES.some((c: any) => c.key === cat) || cat === activeCodeCat.value) return undefined;
  activeCodeCat.value = cat;
  sortKey.value = null;
  persistPrefs();
  return undefined;
}

/** AA 视角：切排序维度 → 重新请求。 */
export function setDim(d: any) {
  if (!AA_DIMENSIONS[d] || d === activeDim.value) return undefined;
  activeDim.value = d;
  activeVendor.value = "all";
  sortKey.value = null;
  sortDir.value = ASC_DEFAULT_DIMS.has(d) ? "asc" : "desc";
  persistPrefs();
  return loadLeaderboard();
}

/** LiveBench 视角：切子维度 → 重新请求。全部 desc 默认, 不动 sortDir 现状。 */
export function setLB(d: any) {
  if (!LIVE_DIMENSIONS[d] || d === activeLB.value) return undefined;
  activeLB.value = d;
  activeVendor.value = "all";
  sortKey.value = null;
  persistPrefs();
  return loadLeaderboard();
}

/** 切厂商：纯本地派生。 */
export function setVendor(v: any) {
  const allowed = v === "all" || VENDOR_META[v];
  activeVendor.value = allowed ? v : "all";
  persistPrefs();
}

export function setLicenseFilter(v: any) {
  const allowed = ["all", "open", "proprietary"].includes(v);
  licenseFilter.value = allowed ? v : "all";
  persistPrefs();
}

/** 切数据健康卡的 source chip 隐藏/显示。不会影响实际数据源是否拉取。
 * @param {string} key
 */
export function toggleHealthSource(key: any) {
  if (!key) return;
  const cur = hiddenHealthSources.value;
  const next = new Set(cur);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  hiddenHealthSources.value = next;
}

/** 重置所有隐藏的 source chip（恢复全显）。 */
export function resetHealthSources() {
  hiddenHealthSources.value = new Set();
}

/** 切排序方向：纯本地派生。 */
export function setSortDir(dir: any) {
  const d = dir === "asc" ? "asc" : "desc";
  if (d === sortDir.value) return;
  sortDir.value = d;
  persistPrefs();
}

let _searchTimer = null;
export function setSearchQuery(v: any) {
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
 * 覆盖所有可排序列，包括 primaryValue 未涵盖的 costPerTask / ci / lb_cost。
 * @returns {number|null}
 */
export function columnValue(model: any, view: any, key: any) {
  // ponytail: HF 视角 (v2.79.5+) — 走 huggingface 切片, 主键 downloads/likes.
  // v2.79.6+: hf_trending 走 computeTrendingScore 客户端按需算, 不存 m.huggingface.
  if (view === "huggingface") {
    const hf = model && model.huggingface;
    if (key === "hf_downloads") return hf && typeof hf.downloads === "number" ? hf.downloads : null;
    if (key === "hf_likes") return hf && typeof hf.likes === "number" ? hf.likes : null;
    if (key === "hf_trending") {
      if (!hf) return null;
      const ts = computeTrendingScore(hf.downloads, hf.lastModified, hf.createdAt);
      return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
    }
    if (key === "hf_license") {
      // ponytail: 返回 rank number (0=open, 1=proprietary, 2=unknown) 跟 main ranking 对齐
      // — store 端 sortValue 走 primaryValue 拿数字, sortModels 数字排序稳定.
      const k = licenseKind(model && model.license);
      return k === "open" ? 0 : k === "proprietary" ? 1 : 2;
    }
    if (key === "context") {
      // 优先级: modelsdev > openrouter (HF 不返回 context)
      const md = model && model.modelsdev;
      if (md && typeof md.contextLength === "number") return md.contextLength;
      const or = model && model.openrouter;
      return or && typeof or.contextLength === "number" && or.contextLength > 0
        ? or.contextLength
        : null;
    }
    return null;
  }
  if (view === "arena") {
    if (key === "elo" || key === "ci" || key === "votes") {
      const board = ARENA_BOARDS[activeBoard.value] || ARENA_BOARDS.text;
      const slice = model && model.arena && model.arena[board.key];
      if (!slice) return null;
      // ponytail: Agent 榜 6 维细分 (v2.8x) — elo/ci 读选中维度, votes 列复用为 sessions 体量.
      if (activeBoard.value === "agent") {
        const dimName = activeAgentDim.value || AGENT_DIMENSION_DEFAULT;
        const dim = slice.dimensions && slice.dimensions[dimName];
        if (key === "elo") {
          return dim && typeof dim.score === "number"
            ? dim.score
            : typeof slice.score === "number"
            ? slice.score
            : null;
        }
        if (key === "ci") return dim && typeof dim.ci === "number" ? dim.ci : null;
        // votes 列在 agent 榜表示参与会话数（sessions）
        return typeof slice.sessions === "number" ? slice.sessions : null;
      }
      // ponytail: 文本/Code 榜 category 子榜 (v2.8x) — elo/ci/votes 读选中 category 切片（默认 overall = slice 本身）。
      if ((activeBoard.value === "text" || activeBoard.value === "code") && slice.categories) {
        const cat = activeBoard.value === "text"
          ? (activeTextCat.value || TEXT_CATEGORY_DEFAULT)
          : (activeCodeCat.value || CODE_CATEGORY_DEFAULT);
        const c = cat === "overall" ? { rank: slice.rank, score: slice.score, ci: slice.ci, votes: slice.votes } : slice.categories[cat];
        if (!c) return null;
        if (key === "elo") return typeof c.score === "number" ? c.score : null;
        if (key === "ci") return c.ci != null ? c.ci : null;
        return c.votes != null ? c.votes : null;
      }
      if (key === "elo") return typeof slice.score === "number" ? slice.score : null;
      if (key === "ci") return slice.ci != null ? slice.ci : null;
      return slice.votes != null ? slice.votes : null;
    }
    if (key === "context") {
      // Arena 视角没有自己的 context 数据. 优先级: modelsdev > openrouter (OR 也返回 context_length).
      const md = model && model.modelsdev;
      if (md && typeof md.contextLength === "number") return md.contextLength;
      const or = model && model.openrouter;
      return or && typeof or.contextLength === "number" && or.contextLength > 0
        ? or.contextLength
        : null;
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
    const cat = { lb_coding: "Coding", lb_language: "Language", lb_instfollow: "IF", lb_reasoning: "Reasoning", lb_math: "Math" }[key];
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
    case "costPerTask":
      return typeof aa.costPerTask === "number" && aa.costPerTask > 0 ? aa.costPerTask : null;
    case "context": {
      // 优先 AA slice (Free tier 不返回, 0), 回退 modelsdev > openrouter.contextLength
      const md = model && model.modelsdev;
      if (md && typeof md.contextLength === "number") return md.contextLength;
      const or = model && model.openrouter;
      return or && typeof or.contextLength === "number" && or.contextLength > 0
        ? or.contextLength
        : null;
    }
    case "inputPrice": {
      // AA Free tier 不返回 input 价. 优先级: modelsdev > openrouter (OR pricing.prompt ×1M).
      const md = model && model.modelsdev;
      if (md && typeof md.inputCostPer1M === "number") return md.inputCostPer1M;
      const or = model && model.openrouter;
      return or && typeof or.inputCostPer1M === "number" ? or.inputCostPer1M : null;
    }
    default: return null;
  }
}

/** 提取模型在当前视角下的排序值（sortKey 优先，否则走当前主维度）。 */
export function sortValue(model: any) {
  const key = sortKey.value;
  if (key) return columnValue(model, activeView.value, key);
  if (activeView.value === "arena") {
    // ponytail: Agent 榜 (v2.8x) — 用选中维度分数排序（primaryValue 走 CATEGORY_BOARD 会错取 text 切片）。
    if (activeBoard.value === "agent") {
      const slice = model && model.arena && model.arena["agent"];
      const dimName = activeAgentDim.value || AGENT_DIMENSION_DEFAULT;
      const dim = slice && slice.dimensions && slice.dimensions[dimName];
      return dim && typeof dim.score === "number"
        ? dim.score
        : slice && typeof slice.score === "number"
        ? slice.score
        : null;
    }
    const board = ARENA_BOARDS[activeBoard.value] || ARENA_BOARDS.text;
    // ponytail: 直接读当前 board 切片（board.key），不走 CATEGORY_BOARD 映射——
    // 新 board（image-edit/image-to-video/video-edit/document/search）的 key 与
    // category→board 映射不一致，映射会错取 text-to-image/text-to-video 等导致排序失效。
    const slice = model && model.arena && model.arena[board.key];
    // ponytail: 文本/Code 榜 category 子榜 (v2.8x) — 按选中 category 排序（默认 overall = slice.score）。
    if ((activeBoard.value === "text" || activeBoard.value === "code") && slice && slice.categories) {
      const cat = activeBoard.value === "text"
        ? (activeTextCat.value || TEXT_CATEGORY_DEFAULT)
        : (activeCodeCat.value || CODE_CATEGORY_DEFAULT);
      const c = cat === "overall" ? slice : slice.categories[cat];
      return c && typeof c.score === "number" ? c.score : null;
    }
    return slice && typeof slice.score === "number" ? slice.score : null;
  }
  if (activeView.value === "livebench") {
    return primaryValue(model, activeLB.value, "llm");
  }
  // ponytail: HF 视角 (v2.79.5+) — 主维度走 activeDim 复用 (HF_DIMENSIONS 校验)
  if (activeView.value === "huggingface") {
    const dim = HF_DIMENSIONS[activeDim.value] ? activeDim.value : "hf_downloads";
    return primaryValue(model, dim, "llm");
  }
  return primaryValue(model, activeDim.value, "llm");
}

/** 越低越优的列（点选时默认升序）。 */
const ASC_DEFAULT_COLS = new Set(["price", "speed", "lb_cost", "costPerTask"]);

/**
 * 列头点选排序：
 *  - 点同一列 → 切换升/降序；
 *  - 点不同列 → 设为该列，并按 better 方向给默认序（低优列 asc，其余 desc）。
 */
export function toggleSort(key: any) {
  if (!key) return;
  if (sortKey.value === key) {
    setSortDir(sortDir.value === "asc" ? "desc" : "asc");
  } else {
    sortKey.value = key;
    sortDir.value = ASC_DEFAULT_COLS.has(key) ? "asc" : "desc";
    // ponytail: 与表头排序对齐偏好里的主维度，避免删掉工具栏下拉后刷新又回默认序
    if (activeView.value === "aa" && AA_DIMENSIONS[key]) activeDim.value = key;
    if (activeView.value === "livebench" && LIVE_DIMENSIONS[key]) activeLB.value = key;
    // ponytail: HF 视角 (v2.79.5+) — 列头点选 hf_* 同步 activeDim 复用.
    if (activeView.value === "huggingface" && HF_DIMENSIONS[key]) activeDim.value = key;
    persistPrefs();
  }
}

export function sortModels(list: any[], opts: { dir?: string } = {}) {
  const dir = opts.dir || sortDir.value;
  const arr = Array.isArray(list) ? list.slice() : [];
  const mult = dir === "asc" ? 1 : -1;
  arr.sort((a: any, b: any) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * mult;
  });
  return arr;
}

export function filterByVendor(list: any, vendor: any) {
  if (!vendor || vendor === "all") return list;
  return (Array.isArray(list) ? list : []).filter((it: any) => it && it.vendor === vendor);
}

export function filterByLicense(list: any, kind: any) {
  if (!kind || kind === "all") return list;
  return (Array.isArray(list) ? list : []).filter((it: any) => licenseKind(it.license) === kind);
}

export function filterBySearch(list: any, q: any) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return list;
  return (Array.isArray(list) ? list : []).filter((it: any) => {
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
    rows = rows.filter((it: any) => {
      const slice = it && it.arena && it.arena[board.key];
      if (!slice || typeof slice.score !== "number") return false;
      // ponytail: 文本/Code 榜 category 子榜 — 非 overall 时仅保留有该 category 分数的模型
      if ((activeBoard.value === "text" || activeBoard.value === "code") && slice.categories) {
        const cat = activeBoard.value === "text"
          ? (activeTextCat.value || TEXT_CATEGORY_DEFAULT)
          : (activeCodeCat.value || CODE_CATEGORY_DEFAULT);
        if (cat !== "overall") {
          const c = slice.categories[cat];
          return c && typeof c.score === "number";
        }
      }
      return true;
    });
  }
  // LiveBench 视角：仅保留 overall 有数据的行（其他 lb_* 列允许空）
  if (activeView.value === "livebench") {
    rows = rows.filter((it: any) => {
      const lb = it && it.livebench;
      return lb && typeof lb.overall === "number";
    });
  }
  // ponytail: AA/HF 同 Arena/LB — OR/MD 目录骨架会灌进上千空行，主列全是 "—"。
  //   只留当前维度有主源值的行；升级路径：主进程 matchesCategory 按 view 主源硬过滤。
  if (activeView.value === "aa") {
    const dim = activeDim.value;
    rows = rows.filter((it: any) => primaryValue(it, dim, "llm") != null);
  }
  if (activeView.value === "huggingface") {
    rows = rows.filter((it: any) => it && it.huggingface && typeof it.huggingface === "object");
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
  return (items.value || []).some((it: any) => it && it.isSample);
}

export function isAllSample() {
  const list = items.value;
  return Array.isArray(list) && list.length > 0 && list.every((it: any) => it && it.isSample);
}

export function hasAttribution(id: any) {
  return (attribution.value || []).some((a: any) => a && a.id === id);
}

export function deriveShown() {
  return getDisplayed();
}
