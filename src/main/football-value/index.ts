/**
 * src/main/football-value/index.ts
 *
 * 模块出口（供 IPC 层 / scheduler 调用）：
 *   - getFootballValueBoard: 聚合入口（对外稳定契约）
 *   - registerFootballValueScheduler: 注册每日同步调度器
 *
 * 逻辑链：读缓存（稳定 key）→ 命中且未过 TTL → 返回 → 否则 fetch（dcaribou R2）
 *   → 写缓存 → 失败网络 → 回退已过期缓存（stale）→ 再失败 sample。
 */
"use strict";

import {
  cacheKey,
  readCache,
  writeCache,
  isStale,
} from "./cache";
import { fetchTopPlayers } from "./fetcher";
import { parseTopPlayers } from "./parser";
import { getSamplePlayers } from "./sample";
import { SOURCE } from "./types";
import { registerFootballValueScheduler } from "./scheduler";
import type { BoardResult, HttpClientLike, Player, SourceKind } from "../../shared/football-value-types";

/**
 * 身价低频数据：3 天 TTL（Transfermarkt 季度级更新）。手动刷新 + TTL 节流。
 * 手动刷新 + TTL 节流：缓存 ≤3 天命中直接返回，>3 天或 force 才真拉。
 * 注：稳定 key（无日期）后，跨日复用同一份缓存。
 */
export const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const BOARD = "top";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 注：loadPrevValues（涨跌对照 Map）已弃用 —— 涨跌列改为"采集时间"语义后，
// prevValueEur 字段不再使用。parser 的 prevByPlayer 入参也不再传入。

/**
/** getFootballValueBoard 的 deps 形状。 */
interface BoardDeps {
  force?: boolean;
  httpClient?: HttpClientLike;
  timeoutMs?: number;
}

/**
 * 聚合入口。对外契约见 BoardResult（shared/football-value-types.ts）。
 */
export async function getFootballValueBoard(deps: BoardDeps = {}): Promise<BoardResult> {
  const key = cacheKey(BOARD);
  const force = Boolean(deps.force);
  const errors: string[] = [];

  // 1) 非强制 + 缓存命中（且未过 TTL）→ 直接返回
  if (!force) {
    const hit = readCache(key);
    if (
      hit &&
      Array.isArray(hit.data.players) &&
      hit.data.players.length > 0 &&
      !isStale(hit.fetchedAt, CACHE_TTL_MS)
    ) {
      return boardPayload(hit.data.players, SOURCE.CACHE, hit.fetchedAt, {
        stale: false,
        errors,
      });
    }
    // 缓存命中但已过 TTL：不主动拉（手动 only），返回 stale 数据并标记，UI 自行决定
    if (hit && Array.isArray(hit.data.players) && hit.data.players.length > 0) {
      return boardPayload(hit.data.players, SOURCE.CACHE, hit.fetchedAt, {
        stale: true,
        errors,
      });
    }
  }

  // 2) force 或缓存未命中 → 拉取 dcaribou R2 两份 CSV.gz + join
  try {
    const payload = await fetchTopPlayers({
      httpClient: deps.httpClient,
      timeoutMs: deps.timeoutMs,
    });
    const parsed = parseTopPlayers(payload.valuationsCsvGz, payload.playersCsvGz);
    if (parsed.errors && parsed.errors.length) errors.push(...parsed.errors);
    const result = boardPayload(parsed.players, SOURCE.LIVE, payload.fetchedAt, {
      errors,
    });
    writeCache(key, { players: result.players, fetchedAt: result.fetchedAt });
    return result;
  } catch (err: any) {
    errors.push(errMsg(err));
  }

  // 3) 拉取失败 → 回退已过期缓存（若存在，标 stale）
  const staleHit = readCache(key);
  if (staleHit && Array.isArray(staleHit.data.players) && staleHit.data.players.length > 0) {
    return boardPayload(staleHit.data.players, SOURCE.CACHE, staleHit.fetchedAt, {
      stale: true,
      errors,
    });
  }

  // 4) 全失败 → sample 兜底（UI 不空白）
  return boardPayload(getSamplePlayers(), SOURCE.SAMPLE, Date.now(), {
    stale: false,
    errors,
    isSample: true,
  });
}

function boardPayload(
  players: Player[],
  source: SourceKind,
  fetchedAtMs: number,
  extra: { stale?: boolean; errors?: string[]; isSample?: boolean } = {},
): BoardResult {
  return {
    ok: true,
    players,
    count: players.length,
    source,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    stale: Boolean(extra.stale),
    isSample: Boolean(extra.isSample) || source === SOURCE.SAMPLE,
    errors: extra.errors || [],
    attribution: [
      {
        id: "transfermarkt",
        text: "数据来源：Transfermarkt（经 dcaribou/transfermarkt-datasets，公开 R2 CDN）",
        url: "https://www.transfermarkt.com/",
        required: source === SOURCE.LIVE,
      },
      {
        id: "sample",
        text: "示例数据（离线快照，非实时）",
        url: null,
        required: false,
      },
    ],
  };
}

let _scheduler: any = null;

/**
 * 注册并对齐模块级调度器句柄（scheduler.start 由 bootstrap 调用）。
 * @param deps
 * @returns {{start:function, stop:function, triggerNow:function}}
 */
export function registerFootballValueSchedulerWrapped(deps: any): any {
  _scheduler = registerFootballValueScheduler(deps || {});
  return _scheduler;
}

export { registerFootballValueSchedulerWrapped as registerFootballValueScheduler };

module.exports = {
  getFootballValueBoard,
  registerFootballValueScheduler: registerFootballValueSchedulerWrapped,
  CACHE_TTL_MS,
};
