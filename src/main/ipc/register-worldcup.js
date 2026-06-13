const stateStore = require("../state-store");
const { fetchWorldcupFixtures } = require("../worldcup/fetcher");
const { refreshWorldcupScores } = require("../worldcup/scores-fetcher");
const { generateMatchInsight } = require("../worldcup/match-ai");
const {
  loadAll: betsLoadAll,
  upsert: betsUpsert,
  remove: betsRemove,
} = require("../worldcup/bets-store");

function registerWorldcupHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle("worldcup:fetch-fixtures", async (_evt, payload) =>
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

  safeHandle("worldcup:refresh-scores", async (_evt, payload) => {
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

  safeHandle("worldcup:generate-insight", async (_evt, payload) => {
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
    async (_evt, payload) => betsUpsert(payload || {}),
    { onError: (err) => ({ ok: false, reason: err && err.message }) },
  );

  safeHandle("worldcup:remove-bet", async (_evt, date) => betsRemove(date));
}

module.exports = { registerWorldcupHandlers };
