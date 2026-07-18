/**
 * src/main/games/epic.js
 *
 * Epic Games Store 数据 — 单一真实来源（Epic 官方 GraphQL，免 key、无 Cloudflare）：
 *   接口名虽然叫 freeGamesPromotions，实际返回 Epic Deals 页全部条目，
 *   既包含常规折扣（15%/20%/40%/50%...），也包含限时免费领取（喜+1）。
 *
 * 我们用同一个端点派生出两条数据：
 *   1) 折扣 (fetchEpicDeals):  discountPrice > 0 && discountPrice < originalPrice
 *   2) 喜+1   (fetchEpicFree): discountPrice === 0 && originalPrice > 0
 *
 * 响应结构（节选）：
 *   data.Catalog.searchStore.elements[]:
 *     title, keyImages[], catalogNs.mappings[].pageSlug, productSlug, urlSlug,
 *     promotions.promotionalOffers[].promotionalOffers[].{ endDate, discountSetting.discountPercentage },
 *     price.totalPrice.{ originalPrice, discountPrice, currencyCode }  (单位为分)
 */

const { toGameDeal, fetchJson } = require("./normalize");

const PROMOTIONS_BASE =
  "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions";

/** 取缩略图：优先 Thumbnail，否则取第一个可用图。 */
function pickThumb(images) {
  if (!Array.isArray(images)) return null;
  const thumb = images.find((i) => i && i.type === "Thumbnail");
  if (thumb && thumb.url) return thumb.url;
  const any = images.find((i) => i && i.url);
  return any ? any.url : null;
}

/** 取产品 slug：优先 catalogNs.mappings[0].pageSlug，回退 productSlug/urlSlug。 */
function pickSlug(el) {
  if (el.catalogNs && Array.isArray(el.catalogNs.mappings) && el.catalogNs.mappings[0]) {
    return el.catalogNs.mappings[0].pageSlug;
  }
  return el.productSlug || el.urlSlug || null;
}

/** 取首个当前促销（promotionalOffers 已是"当前生效"列表）。 */
function pickCurrentPromo(el) {
  const blocks = el.promotions && el.promotions.promotionalOffers;
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const offers = blocks[0].promotionalOffers;
  if (!Array.isArray(offers) || offers.length === 0) return null;
  return offers[0];
}

/**
 * 拉取并解析 Epic 当前促销活动元素列表（deals + free 共用）。
 * 仅返回带有"当前生效" promotionalOffers 的条目，原价无促销项会被过滤掉。
 */
async function fetchEpicPromotions({ country = "CN", locale = "zh-CN" } = {}) {
  const url = `${PROMOTIONS_BASE}?locale=${locale}&country=${country}`;
  const data = await fetchJson(url, { timeoutMs: 9000 });
  const elements =
    (data &&
      data.data &&
      data.data.Catalog &&
      data.data.Catalog.searchStore &&
      data.data.Catalog.searchStore.elements) ||
    [];
  if (!Array.isArray(elements)) return [];
  return elements.filter((el) => el && pickCurrentPromo(el));
}

/** Epic 折扣（Epic 官方促销接口）。 */
async function fetchEpicDeals(opts = {}) {
  const {
    country,
    locale,
    minSavings = 0,
    // sort / pageSize 由 aggregator 透传但 Epic 端点无分页能力，这里不使用。
  } = opts;

  const elements = await fetchEpicPromotions({ country, locale });
  const out = [];
  for (const el of elements) {
    const price = el.price && el.price.totalPrice;
    if (!price) continue;
    const originalCents = Number(price.originalPrice);
    const discountCents = Number(price.discountPrice);
    // 仅"打了折但不是 0 元"的条目算 deals；喜+1（discount=0）归 fetchEpicFree
    if (!(originalCents > 0 && discountCents > 0 && discountCents < originalCents)) {
      continue;
    }
    const promo = pickCurrentPromo(el);
    const savings =
      promo &&
      promo.discountSetting &&
      Number.isFinite(Number(promo.discountSetting.discountPercentage))
        ? Math.round(Number(promo.discountSetting.discountPercentage))
        : Math.round((1 - discountCents / originalCents) * 100);
    if (minSavings > 0 && savings < minSavings) continue;
    const slug = pickSlug(el);
    out.push(
      toGameDeal({
        id: `epic-${slug || el.id || el.title}`,
        platform: "epic",
        title: el.title,
        thumb: pickThumb(el.keyImages),
        salePrice: discountCents / 100,
        normalPrice: originalCents / 100,
        savings,
        currency: price.currencyCode || "USD",
        dealUrl: slug
          ? `https://store.epicgames.com/${locale || "en-US"}/p/${slug}`
          : "https://store.epicgames.com/",
        rating: null,
        releaseDate: null,
        store: "Epic Games Store",
        source: "live",
      }),
    );
  }
  return out;
}

/** Epic 限时免费领取（喜+1）。仅返回"当前正在免费"的条目。 */
async function fetchEpicFree(opts = {}) {
  const country = opts.country || "CN";
  const locale = opts.locale || "zh-CN";
  const elements = await fetchEpicPromotions({ country, locale });
  const out = [];
  for (const el of elements) {
    const price = el.price && el.price.totalPrice;
    if (!price) continue;
    const originalCents = price ? Number(price.originalPrice) : 0;
    const discountCents = price ? Number(price.discountPrice) : 0;
    const isFree = originalCents > 0 && discountCents === 0;
    if (!isFree) continue;
    const promo = pickCurrentPromo(el);
    const freeUntil = promo && promo.endDate ? promo.endDate : null;
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
        promotionType: "giveaway",
        requirements: "活动期间可免费入库",
        provider: "epic",
      }),
    );
  }
  return out;
}

module.exports = { fetchEpicDeals, fetchEpicFree };
