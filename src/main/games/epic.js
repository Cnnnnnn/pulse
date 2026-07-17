/**
 * src/main/games/epic.js
 *
 * Epic Games Store 数据 — 两条真实来源 (均无需 key)：
 *   1) 折扣: CheapShark storeID=25 的 /deals (source:'live')
 *   2) 喜+1 (限时免费领取): Epic 官方 freeGamesPromotions 接口 (source:'live')
 *
 * freeGamesPromotions 结构（节选）：
 *   data.Catalog.searchStore.elements[]:
 *     title, description, keyImages[], catalogNs.mappings[].pageSlug,
 *     promotions.promotionalOffers[] / upcomingPromotionalOffers[],
 *     price.totalPrice.{ originalPrice, discountPrice, currencyCode }  (单位为分)
 */

const { toGameDeal, fetchJson } = require("./normalize");

const STORE_ID = "25";
const DEALS_BASE = "https://www.cheapshark.com/api/1.0/deals";
const FREE_BASE =
  "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions";

/** Epic 折扣（CheapShark）。 */
async function fetchEpicDeals(opts = {}) {
  const { sort = "Deal Rating", pageSize = 30, minSavings = 0 } = opts;
  const params = new URLSearchParams({
    storeID: STORE_ID,
    pageSize: String(pageSize),
    sortBy: sort,
  });
  const data = await fetchJson(`${DEALS_BASE}?${params.toString()}`, {
    timeoutMs: 9000,
  });
  if (!Array.isArray(data)) return [];
  return data.map((d) =>
    toGameDeal({
      id: `epic-${d.dealID}`,
      platform: "epic",
      title: d.title,
      thumb: d.thumb || null,
      salePrice: d.salePrice,
      normalPrice: d.normalPrice,
      savings: d.savings,
      currency: "USD",
      dealUrl: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`,
      rating: d.metacriticScore != null ? Number(d.metacriticScore) : null,
      releaseDate: d.releaseDate || null,
      store: "Epic Games Store",
      source: "live",
      popular: Math.round(Number(d.dealRating) || 0),
    }),
  );
}

/** 取缩略图：优先 Thumbnail，否则取第一个可用图。 */
function pickThumb(images) {
  if (!Array.isArray(images)) return null;
  const thumb = images.find((i) => i && i.type === "Thumbnail");
  if (thumb && thumb.url) return thumb.url;
  const any = images.find((i) => i && i.url);
  return any ? any.url : null;
}

function pickSlug(el) {
  if (el.catalogNs && el.catalogNs.mappings && el.catalogNs.mappings[0]) {
    return el.catalogNs.mappings[0].pageSlug;
  }
  return el.productSlug || el.urlSlug || null;
}

/** Epic 限时免费领取（喜+1）。仅返回"当前正在免费"的条目。 */
async function fetchEpicFree(opts = {}) {
  const country = opts.country || "CN";
  const locale = opts.locale || "zh-CN";
  const url = `${FREE_BASE}?locale=${locale}&country=${country}`;
  const data = await fetchJson(url, { timeoutMs: 9000 });
  const elements =
    (data &&
      data.data &&
      data.data.Catalog &&
      data.data.Catalog.searchStore &&
      data.data.Catalog.searchStore.elements) ||
    [];
  const out = [];
  for (const el of elements) {
    const promos = el.promotions && el.promotions.promotionalOffers;
    const hasCurrent = Array.isArray(promos) && promos.length > 0;
    if (!hasCurrent) continue;
    const price = el.price && el.price.totalPrice;
    const originalCents = price ? Number(price.originalPrice) : 0;
    const discountCents = price ? Number(price.discountPrice) : 0;
    const isFree = originalCents > 0 && discountCents === 0;
    if (!isFree) continue;
    const offer = promos[0].promotionalOffers && promos[0].promotionalOffers[0];
    const freeUntil = offer && offer.endDate ? offer.endDate : null;
    const slug = pickSlug(el);
    out.push(
      toGameDeal({
        id: `epic-free-${slug || el.id || el.title}`,
        platform: "epic",
        title: el.title,
        thumb: pickThumb(el.keyImages),
        salePrice: 0,
        normalPrice: originalCents / 100,
        savings: 100,
        currency: (price && price.currencyCode) || "USD",
        dealUrl: slug
          ? `https://store.epicgames.com/${locale}/p/${slug}`
          : "https://store.epicgames.com/",
        isFree: true,
        freeUntil,
        rating: null,
        releaseDate: null,
        store: "Epic Games Store",
        source: "live",
        popular: 95, // 喜+1 默认高热度
      }),
    );
  }
  return out;
}

module.exports = { fetchEpicDeals, fetchEpicFree };
