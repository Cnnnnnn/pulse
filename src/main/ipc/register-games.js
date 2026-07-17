/**
 * src/main/ipc/register-games.js
 *
 * 游戏优惠聚合 — IPC 注册。
 *   games:getDeals → 聚合各平台折扣 / 喜+1 / 热门榜 (src/main/games/aggregator.js)
 *
 * 2026-07-16 新增。主机平台 (Xbox/PS/Switch) 如需真实数据，可配置 IsThereAnyDeal
 * 免费 key：通过 payload.itadKey 传入，或读取环境变量 ITAD_API_KEY。
 */

const { getGameDeals } = require("../games/aggregator");

function resolveItadKey(payload) {
  if (payload && typeof payload.itadKey === "string" && payload.itadKey.trim()) {
    return payload.itadKey.trim();
  }
  return process.env.ITAD_API_KEY || null;
}

function registerGamesHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle(
    "games:getDeals",
    async (_event, payload) => {
      const opts =
        payload && typeof payload === "object" ? payload : {};
      const allowedPlatforms = [
        "all",
        "steam",
        "epic",
        "xbox",
        "playstation",
        "switch",
      ];
      const allowedModes = ["deals", "free", "top"];
      const allowedSorts = ["savings", "price", "rating"];
      const platform = allowedPlatforms.includes(opts.platform)
        ? opts.platform
        : "all";
      const mode = allowedModes.includes(opts.mode) ? opts.mode : "deals";
      const sort = allowedSorts.includes(opts.sort) ? opts.sort : "savings";
      const minSavings =
        Number(opts.minSavings) > 0 && Number(opts.minSavings) <= 100
          ? Math.round(Number(opts.minSavings))
          : 0;
      try {
        const result = await getGameDeals({
          platform,
          mode,
          sort,
          minSavings,
          country: opts.country || "CN",
          itadKey: resolveItadKey(opts),
        });
        return result;
      } catch (err) {
        return {
          ok: false,
          reason: "aggregate_failed",
          error: err && err.message,
          items: [],
          sources: {},
          count: 0,
        };
      }
    },
    {
      logMeta: (_evt, payload) => ({
        platform: payload && payload.platform,
        mode: payload && payload.mode,
      }),
    },
  );
}

module.exports = { registerGamesHandlers };
