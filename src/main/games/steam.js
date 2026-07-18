/**
 * src/main/games/steam.js
 *
 * Steam 折扣数据 — 走 CheapShark 公开 API (storeID=1, 无需 key)。
 * 真实数据 (source: 'live')。
 *
 * CheapShark /deals 返回字段（节选）：
 *   title, salePrice, normalPrice, savings, dealID, storeID,
 *   dealRating, thumb, steamRatingPercent, releaseDate, metacriticScore, steamAppID
 */

const { toGameDeal, fetchJson } = require("./normalize");

const STORE_ID = "1";
const BASE = "https://www.cheapshark.com/api/1.0/deals";

function buildUrl({ sort = "Deal Rating", pageSize = 30 }) {
  const params = new URLSearchParams({
    storeID: STORE_ID,
    pageSize: String(pageSize),
    sortBy: sort,
  });
  return `${BASE}?${params.toString()}`;
}

/**
 * @param {{sort?:string, pageSize?:number}} opts
 * @returns {Promise<object[]>} 规范化 GameDeal 数组 (source:'live')
 */
async function fetchSteamDeals(opts = {}) {
  const { sort = "Deal Rating", pageSize = 30 } = opts;
  const data = await fetchJson(buildUrl({ sort, pageSize }), {
    timeoutMs: 9000,
  });
  if (!Array.isArray(data)) return [];
  return data.map((d) => {
    const appId = d.steamAppID;
    const dealUrl = appId
      ? `https://store.steampowered.com/app/${appId}/`
      : `https://www.cheapshark.com/redirect?dealID=${d.dealID}`;
    const rating =
      d.steamRatingPercent != null
        ? Number(d.steamRatingPercent)
        : d.metacriticScore != null
          ? Number(d.metacriticScore)
          : null;
    return toGameDeal({
      id: `steam-${d.steamAppID || d.dealID}`,
      platform: "steam",
      title: d.title,
      thumb: d.thumb || null,
      salePrice: d.salePrice,
      normalPrice: d.normalPrice,
      savings: d.savings,
      currency: "USD",
      dealUrl,
      rating,
      releaseDate: d.releaseDate || null,
      store: "Steam",
      source: "live",
      // CheapShark dealRating(0-100) 作为热度代理；叠加好评率权重
      popular: Math.round(
        (Number(d.dealRating) || 0) * 0.7 + (rating || 0) * 0.3,
      ),
    });
  });
}

module.exports = { fetchSteamDeals };
