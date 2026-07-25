// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import * as stateStore from "../state-store";
const {
  computeWorldcupBracket,
  loadWorldcupBracket,
} = require("../worldcup/bracket.ts");
import { fetchWorldcupFixtures } from "../worldcup/fetcher";
import { refreshWorldcupScores } from "../worldcup/scores-fetcher";
import { generateMatchInsight } from "../worldcup/match-ai";
const {
  loadAll: betsLoadAll,
  upsert: betsUpsert,
  remove: betsRemove,
} = require("../worldcup/bets-store.ts");

export function registerWorldcupHandlers(ctx: any) {
  const { safeHandle } = ctx;

  safeHandle("worldcup:fetch-fixtures", async (_evt: any, payload: any) =>
    fetchWorldcupFixtures(payload || {}),
  );

  safeHandle("worldcup:load-scores", async () => {
    const cache = stateStore.loadWorldcupScores();
    return {
      ok: true,
      scores: cache ? cache.entries : {},
      ts: cache ? cache.ts : 0,
    };
  });

  safeHandle("worldcup:refresh-scores", async (_evt: any, payload: any) => {
    const eligibleKeys =
      payload && Array.isArray(payload.eligibleKeys)
        ? payload.eligibleKeys
        : [];
    return refreshWorldcupScores(eligibleKeys);
  });

  safeHandle(
    "worldcup:load-insights",
    async () => {
      const cache = stateStore.loadWorldcupMatchInsights();
      return {
        ok: true,
        insights: cache ? cache.entries : {},
        ts: cache ? cache.ts : 0,
      };
    },
    { log: false },
  );

  safeHandle("worldcup:generate-insight", async (_evt: any, payload: any) => {
    const match = payload && payload.match;
    const type = payload && payload.type;
    const force = !!(payload && payload.force);
    const scoreEntry = payload && payload.scoreEntry;
    return generateMatchInsight({ match, type, force, scoreEntry });
  });

  safeHandle("worldcup:load-bets", async () => ({
    ok: true,
    ...betsLoadAll(),
  }));

  safeHandle(
    "worldcup:upsert-bet",
    async (_evt: any, payload: any) => betsUpsert(payload || {}),
    { onError: (err: any) => ({ ok: false, reason: errMsg(err) }) },
  );

  safeHandle("worldcup:compute-bracket", async (_evt: any, payload: any) =>
    computeWorldcupBracket(payload || {}),
  );

  safeHandle(
    "worldcup:load-bracket",
    async () => loadWorldcupBracket(),
    { log: false },
  );

  safeHandle("worldcup:remove-bet", async (_evt: any, date: any) => betsRemove(date));
}

module.exports = { registerWorldcupHandlers };