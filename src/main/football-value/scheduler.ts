/**
 * src/main/football-value/scheduler.ts
 *
 * 主进程每日同步调度（封装 setManagedInterval）。
 * 身价低频数据：每日拉一次（预暖缓存），失败 graceful（不阻断启动 / 不抛）。
 *
 * 与 ai-leaderboard/scheduler.ts 同构；由 main/bootstrap/schedulers.ts 在启动期注册。
 */
"use strict";

import { setManagedInterval, clearManaged } from "../timer-registry";
import { getFootballValueBoard } from "./index";
import { mainLog } from "../log";

const DAILY_MS = 24 * 60 * 60 * 1000;

let _handle: any = null;

/**
 * 注册足球球员身价榜每日同步调度器。
 * @param deps
 * @returns {{start:function, stop:function, triggerNow:function}}
 */
export function registerFootballValueScheduler(deps: any = {}): any {
  const intervalMs =
    typeof deps.intervalMs === "number" && deps.intervalMs > 0
      ? deps.intervalMs
      : DAILY_MS;

  async function triggerNow() {
    try {
      await getFootballValueBoard({ force: true });
      mainLog.info("[football-value] daily sync ok");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      mainLog.warn(`[football-value] daily sync failed: ${msg}`);
    }
  }

  function start() {
    if (_handle) return;
    try {
      // ponytail: 一次性 30-90 min jitter, 避免跟所有 Pulse 用户同一 UTC 时间点叠峰打 R2 CDN
      const firstDelayMs = 30 * 60 * 1000 + Math.floor(Math.random() * 60 * 60 * 1000);
      setTimeout(() => triggerNow().catch(() => {}), firstDelayMs);
      mainLog.info(
        `[football-value] first sync scheduled in ${Math.round(firstDelayMs / 60000)}min`,
      );
      _handle = setManagedInterval(
        () => {
          triggerNow().catch(() => {});
        },
        intervalMs,
        {
          label: "football-value",
          file: "src/main/football-value/scheduler.ts",
          line: 0,
        },
      );
      mainLog.info(
        `[football-value] scheduler started (every ${Math.round(intervalMs / 60000)}min)`,
      );
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      mainLog.warn(`[football-value] scheduler init failed: ${msg}`);
    }
  }

  function stop() {
    if (_handle) {
      try {
        clearManaged(_handle);
      } catch {
        /* noop */
      }
      _handle = null;
    }
  }

  return { start, stop, triggerNow };
}

module.exports = { registerFootballValueScheduler };
