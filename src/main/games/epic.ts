/**
 * src/main/games/epic.ts
 *
 * Epic Games Store 数据 — 单一真实来源（Epic 官方 GraphQL，免 key、无 Cloudflare）。
 */
"use strict";

const { toGameDeal, fetchJson } = require("./normalize.ts");

const PROMOTIONS_BASE =
  "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions";

function pickThumb(images: any): string | null {
  if (!Array.isArray(images)) return null;
  const thumb = images.find((i: any) => i && i.type === "Thumbnail");
  if (thumb && thumb.url) return thumb.url;
  const any = images.find((i: any) => i && i.url);
  return any ? any.url : null;
}

function pickSlug(el: any): string | null {
  if (el.catalogNs && Array.isArray(el.catalogNs.mappings) && el.catalogNs.mappings[0]) {
    return el.catalogNs.mappings[0].pageSlug;
  }
  return el.productSlug || el.urlSlug || null;
}

function pickCurrentPromo(el: any): any {
  const blocks = el.promotions && el.promotions.promotionalOffers;
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const offers = blocks[0].promotionalOffers;
  if (!Array.isArray(offers) || offers.length === 0) return null;
  return offers[0];
}

export async function fetchEpicPromotions({ country = "CN", locale = "zh-CN" }: any = {}): Promise<any[]> {
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
  return elements.filter((el: any) => el && pickCurrentPromo(el));
}

export async function fetchEpicDeals(opts: any = {}): Promise<any[]> {
  const {
    country,
    locale,
    minSavings = 0,
  } = opts;

  const elements = await fetchEpicPromotions({ country, locale });
  const out: any[] = [];
  for (const el of elements) {
    const price = el.price && el.price.totalPrice;
    if (!price) continue;
    const originalCents = Number(price.originalPrice);
    const discountCents = Number(price.discountPrice);
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

export async function fetchEpicFree(opts: any = {}): Promise<any[]> {
  const country = opts.country || "CN";
  const locale = opts.locale || "zh-CN";
  const elements = await fetchEpicPromotions({ country, locale });
  const out: any[] = [];
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
        popular: 95,
        promotionType: "giveaway",
        requirements: "活动期间可免费入库",
        provider: "epic",
      }),
    );
  }
  return out;
}

module.exports = { fetchEpicDeals, fetchEpicFree };
