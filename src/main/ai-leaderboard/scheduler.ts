/**
 * src/main/ai-leaderboard/scheduler.ts
 *
 * 主进程每日同步调度（封装 setManagedInterval）。
 * 每日拉取一次（预暖缓存），失败 graceful（不阻断启动 / 不抛）。
 *
 * 与 bootstrap/schedulers.js 的其它调度器同构；由 main/index.js 在启动期注册。
 */

import { setManagedInterval, setManagedTimeout, clearManaged } from "../timer-registry";
import { getLeaderboard } from "./aggregator";
import { pruneOldCache } from "./history";
import { mainLog } from "../log";

const DAILY_MS = 24 * 60 * 60 * 1000;
/** 启动预热延迟 — 让快的源（OR/MD/HF/LB）尽早进缓存；Arena 无缓存时冷拉靠 SWR 不阻塞 UI。 */
const WARMUP_DELAY_MS = 15 * 1000;

let _handle: any = null;
let _warmupHandle: any = null;

/**
 * 注册 AI 榜单每日同步调度器。
 * @param deps
 * @returns {{start:function, stop:function, triggerNow:function}}
 */
export function registerLeaderboardScheduler(deps: any = {}): any {
  const intervalMs =
    typeof deps.intervalMs === "number" && deps.intervalMs > 0
      ? deps.intervalMs
      : DAILY_MS;

  async function triggerNow() {
    try {
      await getLeaderboard({ force: false });
      pruneOldCache(30);
      mainLog.info("[ai-leaderboard] daily sync ok");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      mainLog.warn(`[ai-leaderboard] daily sync failed: ${msg}`);
    }
  }

  function start() {
    if (_handle) return;
    try {
      // 启动预热：15s 后预拉一次（force=false）——快源尽早进缓存；有新缓存时冷启动秒开。
      // 走受管定时器（不占 global.setTimeout，避免干扰 jitter 测试与启动期其它裸定时器）。
      if (!_warmupHandle) {
        _warmupHandle = setManagedTimeout(
          () => {
            _warmupHandle = null;
            triggerNow().catch(() => {});
          },
          WARMUP_DELAY_MS,
          { label: "ai-leaderboard-warmup", file: "src/main/ai-leaderboard/scheduler.ts", line: 0 },
        );
      }
      // ponytail: 一次性 30-90 min jiterr, 避免跟所有 Pulse 用户在同一 UTC 时间点叠峰打 AA + 避开启动 check 抢资源
      const firstDelayMs = 30 * 60 * 1000 + Math.floor(Math.random() * 60 * 60 * 1000);
      setTimeout(() => triggerNow().catch(() => {}), firstDelayMs);
      mainLog.info(
        `[ai-leaderboard] first sync scheduled in ${Math.round(firstDelayMs / 60000)}min; warmup in ${WARMUP_DELAY_MS / 1000}s`,
      );
      _handle = setManagedInterval(
        () => {
          triggerNow().catch(() => {});
        },
        intervalMs,
        {
          label: "ai-leaderboard",
          file: "src/main/ai-leaderboard/scheduler.ts",
          line: 0,
        },
      );
      mainLog.info(
        `[ai-leaderboard] scheduler started (every ${Math.round(intervalMs / 60000)}min)`,
      );
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      mainLog.warn(`[ai-leaderboard] scheduler init failed: ${msg}`);
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
    if (_warmupHandle) {
      try {
        clearManaged(_warmupHandle);
      } catch {
        /* noop */
      }
      _warmupHandle = null;
    }
  }

  return { start, stop, triggerNow };
}

