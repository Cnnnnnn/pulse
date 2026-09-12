/**
 * src/main/digest/ai-movers.ts
 *
 * v3.1: 早报「AI 榜单异动」数据源 — 读 arena 磁盘缓存最新两份快照做排名 diff.
 * 纯读 (不触发网络 / 不耗 AA 令牌), 无缓存或只有一份快照时返回空 items.
 *
 * 注意: arena 缓存板名是 "all-v11" (v2.8x 11-board 升级后的写入口), 不是
 * history.ts 读的 "all" — history 的板名 mismatch 是单独已知问题, 本模块不走它.
 */

import { readCache, listCacheKeysDesc } from "../ai-leaderboard/cache";
import { slugifyModel, normalizeVendor } from "../ai-leaderboard/types";

export const ARENA_CACHE_SOURCE = "arena";
export const ARENA_CACHE_BOARD = "all-v11";

const MOVERS_CAP = 3;
const MIN_RANK_DELTA = 2; // |Δrank| ≥ 2 才算异动 — 过滤 ±1 位抖动

export type AiMoverItem = {
  model: string;
  vendor: string;
  board: string;
  from: number | null;
  to: number;
  delta: number | null; // >0 上升; 新上榜为 null
  is_new: boolean;
};

export type AiMoversPayload = {
  items: AiMoverItem[];
  ts: number;
};

type BoardModel = { model: string; vendor: string; rank: number };
type SnapshotMap = Map<string, { model: string; vendor: string; boards: Map<string, BoardModel> }>;

/** 把一份 arena 缓存 entry 展开成 id → {model, vendor, board → {rank}} */
function extractModels(entry: { data: any } | null): SnapshotMap {
  const map: SnapshotMap = new Map();
  const boards = entry && entry.data && entry.data.boards;
  if (!boards || typeof boards !== "object") return map;
  for (const boardName of Object.keys(boards)) {
    const payload = boards[boardName];
    const models = Array.isArray(payload && payload.models)
      ? payload.models
      : Array.isArray(payload && payload.data)
        ? payload.data
        : [];
    for (const m of models) {
      if (!m || !m.model) continue;
      const rank = Number(m.rank);
      if (!Number.isFinite(rank) || rank < 1) continue;
      const vendor = normalizeVendor(m.vendor || "");
      const id = slugifyModel(vendor, m.model);
      if (!map.has(id)) map.set(id, { model: String(m.model), vendor, boards: new Map() });
      const rec = map.get(id)!;
      // 同一模型同 board 只留最好名次 (快照内部理论无重复, 兜底)
      const prev = rec.boards.get(boardName);
      if (!prev || rank < prev.rank) rec.boards.set(boardName, { model: rec.model, vendor, rank });
    }
  }
  return map;
}

/**
 * 计算榜单异动. 取 arena 缓存最新两份 (任意相邻两天), diff 出排名变动最大的模型.
 * @param opts.maxItems 最多返回几条 (默认 3)
 * @returns { items, ts } — items 为空表示无足够快照 / 无异动, 调用方应跳过该 section
 */
export function computeAiMovers(
  opts: { maxItems?: number } = {},
): AiMoversPayload {
  const cap = typeof opts.maxItems === "number" && opts.maxItems > 0 ? opts.maxItems : MOVERS_CAP;
  const keys = listCacheKeysDesc(ARENA_CACHE_SOURCE, ARENA_CACHE_BOARD);
  if (keys.length < 2) return { items: [], ts: Date.now() };

  const current = extractModels(readCache(keys[0]));
  const baseline = extractModels(readCache(keys[1]));
  if (current.size === 0 || baseline.size === 0) return { items: [], ts: Date.now() };

  const movers: AiMoverItem[] = [];
  const newEntries: AiMoverItem[] = [];

  for (const [id, cur] of current) {
    const prev = baseline.get(id);
    if (!prev) {
      // 新上榜 — 取其最好 board
      let bestBoard: string | null = null;
      let bestRank = Infinity;
      for (const [board, bm] of cur.boards) {
        if (bm.rank < bestRank) {
          bestRank = bm.rank;
          bestBoard = board;
        }
      }
      if (bestBoard) {
        newEntries.push({
          model: cur.model,
          vendor: cur.vendor,
          board: bestBoard,
          from: null,
          to: bestRank,
          delta: null,
          is_new: true,
        });
      }
      continue;
    }
    for (const [board, bm] of cur.boards) {
      const prevBm = prev.boards.get(board);
      if (!prevBm) continue;
      const delta = prevBm.rank - bm.rank; // >0 = 排名上升
      if (Math.abs(delta) < MIN_RANK_DELTA) continue;
      movers.push({
        model: cur.model,
        vendor: cur.vendor,
        board,
        from: prevBm.rank,
        to: bm.rank,
        delta,
        is_new: false,
      });
    }
  }

  // 真异动优先 (|delta| 降序), 新上榜垫底 (名次好在前); 每模型只留最强一条,
  // 避免同一模型占满 cap 席位
  const seen = new Set<string>();
  const picked: AiMoverItem[] = [];
  const byMove = [...movers].sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
  const byNew = [...newEntries].sort((a, b) => a.to - b.to);
  for (const it of [...byMove, ...byNew]) {
    const key = `${it.vendor}::${it.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(it);
    if (picked.length >= cap) break;
  }

  return { items: picked, ts: Date.now() };
}
