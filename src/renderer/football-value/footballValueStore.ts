/**
 * src/renderer/football-value/footballValueStore.ts
 *
 * 足球球员身价榜 store：signals + IPC 拉取 + 纯本地筛选/排序。
 * - loadBoard(): 进入模块拉数据（无 force 不重复请求）
 * - refresh(): 强制重拉（后台刷新，保留旧数据，置 refreshing）
 * - 本地筛选：位置(多选) / 联赛 / 身价区间(多选) / 搜索 / 排序(三态)
 *
 * 设计：采集时间语义（信任条显示"更新于 X天前 (HH:MM)"）；涨跌列已移除（季度级更新无日常 diff）。
 */
import { signal, batch } from "@preact/signals";
import { api } from "../api.ts";
import { POSITION_KEYS, POSITION_META } from "./types.ts";

/* ── 身价区间（热度分桶）── */
export const VALUE_BANDS = [
  { key: "b150", label: "≥€150M", test: (v: number) => v >= 150e6 },
  { key: "b100", label: "€100–150M", test: (v: number) => v >= 100e6 && v < 150e6 },
  { key: "b50", label: "€50–100M", test: (v: number) => v >= 50e6 && v < 100e6 },
  { key: "b0", label: "<€50M", test: (v: number) => v < 50e6 },
];
export function bandOf(eur: any): string {
  const v = Number(eur) || 0;
  for (const b of VALUE_BANDS) if (b.test(v)) return b.key;
  return "b0";
}

/* ── 数据态 ── */
export const players = signal([]);
/** 初次加载（展示骨架屏）。 */
export const loading = signal(false);
/** 后台刷新（保留旧数据，仅按钮转圈）。 */
export const refreshing = signal(false);
export const error = signal(null); // string | null
export const source = signal(null); // "live" | "cache" | "sample"
export const stale = signal(false);
export const fromCache = signal(false);
export const isSample = signal(false);
export const fetchedAt = signal(null);
/** 部分源失败明细（norm.ok 但 errors.length>0 → 部分态）。 */
export const errors = signal([]);
/** 全榜峰值（热度条基线，过滤后不变），加载后计算。 */
export const maxValueEur = signal(0);

/* ── 筛选 / 排序态 ── */
/** 位置多选集合。 */
export const activePositions = signal(new Set());
/** 联赛："all" 或具体联赛名。 */
export const activeLeague = signal("all");
/** 身价区间多选集合（VALUE_BANDS 键）。 */
export const activeBands = signal(new Set());
/** 排序键：value | delta | age | name。 */
export const sortKey = signal("value");
/** 排序方向：'asc' | 'desc' | null（null = 无排序，默认按身价降序）。 */
export const sortDir = signal("desc");
/** 搜索词（球员名 / 俱乐部 / 联赛 / 国籍）。 */
export const searchQuery = signal("");

let _reqToken = 0;

/** 归一化主进程返回的 board result（容错 + 兜底去重）。 */
export function normalizeBoardResult(res: any): any {
  const r = res && typeof res === "object" ? res : {};
  let list = Array.isArray(r.players) ? r.players : [];
  // 纵深防御：若上游 parser 未去重（或新数据源引入重复），renderer 侧兜底按 id 去重。
  // 保留首次出现（最小 rank），与 parser.ts seen 逻辑一致。
  if (list.length > 1) {
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const p of list) {
      if (!p) continue;
      const dk = p.id || `name:${String(p.name || "").trim().toLowerCase()}`;
      if (seen.has(dk)) continue;
      seen.add(dk);
      deduped.push(p);
    }
    list = deduped;
  }
  return {
    ok: Boolean(r.ok) || list.length > 0,
    players: list,
    count: Array.isArray(r.players) ? r.players.length : 0,
    source: typeof r.source === "string" ? r.source : null,
    stale: Boolean(r.stale),
    fromCache: Boolean(r.fromCache),
    isSample: Boolean(r.isSample),
    fetchedAt: typeof r.fetchedAt === "string" ? r.fetchedAt : null,
    errors: Array.isArray(r.errors) ? r.errors : [],
    error: typeof r.error === "string" ? r.error : null,
  };
}

function computeMax(list: any[]) {
  let m = 0;
  for (const p of list) {
    const v = Number(p && p.valueEur) || 0;
    if (v > m) m = v;
  }
  return m;
}

async function _run(force: boolean) {
  const token = ++_reqToken;
  if (force) refreshing.value = true;
  else loading.value = true;
  error.value = null;
  try {
    const res = force ? await api.footballValueRefresh() : await api.footballValueGet();
    if (token !== _reqToken) return;
    const norm = normalizeBoardResult(res);
    batch(() => {
      if (norm.ok) {
        players.value = norm.players;
        source.value = norm.source;
        stale.value = norm.stale;
        fromCache.value = norm.fromCache;
        isSample.value = norm.isSample;
        fetchedAt.value = norm.fetchedAt;
        errors.value = norm.errors;
        maxValueEur.value = computeMax(norm.players);
        error.value = null;
      } else {
        // 全量失败：有旧数据则保留（后台刷新失败），否则清空报错
        if (players.value.length === 0) {
          players.value = [];
          source.value = null;
          stale.value = false;
          fromCache.value = false;
          isSample.value = false;
          fetchedAt.value = null;
        }
        errors.value = norm.errors;
        error.value = players.value.length === 0 ? (norm.error || "加载失败") : null;
      }
    });
  } catch (e: any) {
    if (token !== _reqToken) return;
    batch(() => {
      if (players.value.length === 0) {
        error.value = e && e.message ? e.message : "网络错误";
        players.value = [];
        source.value = null;
        stale.value = false;
        fromCache.value = false;
        isSample.value = false;
        fetchedAt.value = null;
      } else {
        // 后台刷新异常：保留旧数据，仅记录错误
        errors.value = [e && e.message ? e.message : "网络错误"];
        error.value = null;
      }
    });
  } finally {
    if (token === _reqToken) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}

/** 进入模块时调用。已加载且非 force 时不重复请求。 */
export async function loadBoard(force = false) {
  if (players.value.length > 0 && !force) return;
  return _run(force);
}

/** 手动刷新（工具栏 / 空态 CTA）。后台刷新保留旧数据。 */
export function refresh() {
  return _run(true);
}

/* ── 本地筛选（不触发 IPC）── */

/** 位置多选切换；pos===null 清空。 */
export function setPosition(pos: any) {
  if (pos === null) {
    activePositions.value = new Set();
    return;
  }
  if (!POSITION_KEYS.includes(pos)) return;
  const next = new Set(activePositions.value);
  if (next.has(pos)) next.delete(pos);
  else next.add(pos);
  activePositions.value = next;
}

/** 联赛单选；lg==="all" 或具体联赛名。 */
export function setLeague(lg: any) {
  activeLeague.value = lg === "all" ? "all" : String(lg);
}

/** 身价区间多选切换。 */
export function toggleBand(key: any) {
  if (!VALUE_BANDS.some((b) => b.key === key)) return;
  const next = new Set(activeBands.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  activeBands.value = next;
}

/** 排序：表头点击三态循环（desc → asc → null → desc）。 */
export function cycleSort(key: string) {
  if (sortKey.value !== key) {
    sortKey.value = key;
    sortDir.value = key === "name" ? "asc" : "desc";
    return;
  }
  sortDir.value = sortDir.value === "desc" ? "asc" : sortDir.value === "asc" ? null : "desc";
}

/** 直接设置排序（来自排序下拉）。 */
export function setSort(key: string, dir: "asc" | "desc" | null) {
  sortKey.value = key;
  sortDir.value = dir;
}

export function setSearchQuery(q: any) {
  searchQuery.value = (q || "").toString().trim();
}

export function clearSearchQuery() {
  searchQuery.value = "";
}

/** 清空全部本地筛选（位置 / 联赛 / 区间 / 搜索），保留排序。 */
export function clearFilters() {
  activePositions.value = new Set();
  activeLeague.value = "all";
  activeBands.value = new Set();
  searchQuery.value = "";
}

/* ── 联动计数（排除自身维度后统计其他维度）── */
function _filterExcept(except: "positions" | "league" | "bands" | "none") {
  let list = Array.isArray(players.value) ? players.value : [];
  const q = (searchQuery.value || "").trim().toLowerCase();
  if (q) {
    list = list.filter((p: any) => {
      if (!p) return false;
      const hay = [p.name, p.club, p.nationality, p.league].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }
  if (except !== "league" && activeLeague.value !== "all") {
    list = list.filter((p: any) => p && p.league === activeLeague.value);
  }
  if (except !== "positions" && activePositions.value.size) {
    list = list.filter((p: any) => p && activePositions.value.has(p.position));
  }
  if (except !== "bands" && activeBands.value.size) {
    list = list.filter((p: any) => p && activeBands.value.has(bandOf(p.valueEur)));
  }
  return list;
}

/** 各位置计数（排除位置维度，叠加其余筛选）。 */
export function positionCounts(): Record<string, number> {
  const base = _filterExcept("positions");
  const out: Record<string, number> = {};
  for (const k of POSITION_KEYS) out[k] = base.filter((p: any) => p.position === k).length;
  return out;
}

/** 各联赛计数（排除联赛维度），含 "all"。 */
export function leagueCounts(): Record<string, number> {
  const base = _filterExcept("league");
  const out: Record<string, number> = { all: base.length };
  for (const p of base) {
    const lg = p.league || "—";
    out[lg] = (out[lg] || 0) + 1;
  }
  delete out["—"];
  return out;
}

/** 各身价区间计数（排除区间维度）。 */
export function bandCounts(): Record<string, number> {
  const base = _filterExcept("bands");
  const out: Record<string, number> = {};
  for (const b of VALUE_BANDS) out[b.key] = base.filter((p: any) => bandOf(p.valueEur) === b.key).length;
  return out;
}

/** 唯一联赛列表（升序），供下拉。 */
export function leagueOptions(): string[] {
  const set = new Set<string>();
  for (const p of Array.isArray(players.value) ? players.value : []) {
    if (p && p.league) set.add(p.league);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ── 排序 ── */
function _val(p: any) {
  return Number(p && p.valueEur) || 0;
}

export function sortDisplayed(list: any[]): any[] {
  const k = sortKey.value;
  const d = sortDir.value;
  const out = (Array.isArray(list) ? list : []).slice();
  if (!d) {
    out.sort((a: any, b: any) => _val(b) - _val(a));
    return out;
  }
  const score = (p: any): number | string => {
    if (k === "value") return _val(p);
    if (k === "age") return Number(p && p.age) || 0;
    if (k === "name") return String((p && p.name) || "").toLowerCase();
    return _val(p);
  };
  out.sort((a: any, b: any) => {
    let cmp: number;
    if (k === "name") cmp = String(score(a)).localeCompare(String(score(b)));
    else {
      const ra = score(a) as number;
      const rb = score(b) as number;
      cmp = ra < rb ? -1 : ra > rb ? 1 : 0;
    }
    if (cmp === 0) cmp = _val(b) - _val(a); // 同分按身价降序
    return d === "asc" ? cmp : -cmp;
  });
  return out;
}

/** 当前筛选+排序后的展示列表。 */
export function getDisplayed(): any[] {
  if (!Array.isArray(players.value) || players.value.length === 0) return [];
  return sortDisplayed(_filterExcept("none"));
}

/** 是否任一数据源是 sample（UI 显示"示例数据"徽标）。 */
export function hasSampleSource() {
  return source.value === "sample" || isSample.value;
}

/** 当前是否处于"部分源失败"态（有数据但 errors 非空）。 */
export function isPartial() {
  return errors.value.length > 0 && players.value.length > 0;
}

/** 当前是否处于"无任何筛选/搜索"态（用于摘要显隐）。 */
export function hasActiveFilters() {
  return (
    activePositions.value.size > 0 ||
    activeLeague.value !== "all" ||
    activeBands.value.size > 0 ||
    (searchQuery.value || "").trim() !== ""
  );
}
