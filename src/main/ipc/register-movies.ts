/**
 * src/main/ipc/register-movies.ts
 *
 * 电影模块唯一 electron 边界. 通过 ctx.safeHandle 注册 3 个 channel:
 *   movies:load      返 cache (不触网)
 *   movies:refresh   触发 L1→L2→L3→L4 降级拉取 + 推 movies:updated
 *   movies:detail    按 movieId 拉猫眼详情（直连 m.maoyan.com）
 *
 * refresh 永远 resolve（最坏 = 内置示例），不在主链路抛硬失败给渲染层.
 */

import type {} from "electron";
import type { IpcChannelMap, MoviesPayload, MovieItem } from "../../shared/ipc-contracts";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { fetchMaoyanDetail } from "../movies/fetcher-maoyan";
import { createMoviesCache } from "../movies/cache";
import { HttpClient } from "../http-client";
import { mainLog } from "../log";

export const UPDATED_CHANNEL = "movies:updated";
const TIMEOUT_MS = 10000;

export function registerMoviesHandlers(ctx: any) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  const httpClient = new HttpClient({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const tmdbApiKey = process.env.TMDB_API_KEY || "";

  const cache = createMoviesCache({
    httpClient,
    tmdbApiKey,
    onUpdate: (payload: IpcChannelMap["movies:load"]["result"]) => {
      if (typeof sendToRenderer === "function") {
        try {
          sendToRenderer(UPDATED_CHANNEL, payload);
        } catch {
          /* noop */
        }
      }
    },
  });

  safeHandle("movies:load", (): MoviesPayload | null => cache.load());

  safeHandle("movies:refresh", async (): Promise<MoviesPayload> => {
    try {
      return await cache.refresh();
    } catch (err: any) {
      const reason =
        err && typeof err === "object" && "reason" in err ? (err as any).reason : null;
      mainLog.warn(`[ipc] movies:refresh failed: reason=${reason}, msg=${errMsg(err)}`);
      // 理论不会到这（cache 兜底到示例），但仍给稳的回退
      return { nowPlaying: [], coming: [], fetchedAt: Date.now(), source: "error" };
    }
  });

  safeHandle(
    "movies:detail",
    async (_evt: unknown, movieId: string): Promise<MovieItem | { ok: false; reason: string }> => {
      if (!movieId || typeof movieId !== "string") {
        return { ok: false, reason: "invalid_args" };
      }
      try {
        return await fetchMaoyanDetail({ httpClient, movieId, timeoutMs: TIMEOUT_MS });
      } catch (err: any) {
        const reason =
          err && typeof err === "object" && "reason" in err ? (err as any).reason : "threw";
        mainLog.warn(`[ipc] movies:detail failed: id=${movieId}, reason=${reason}`);
        return { ok: false, reason };
      }
    },
  );
}

module.exports = { registerMoviesHandlers, UPDATED_CHANNEL };
