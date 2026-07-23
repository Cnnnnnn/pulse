/**
 * src/main/games/xbox-free.ts
 *
 * Xbox Free Play Days（Game Pass 会员限时免费试玩）。
 */
"use strict";

const { fetchJson, toGameDeal, BROWSER_UA } = require("./normalize");
const { logFetchError } = require("./log");

const RSS_URL = "https://news.xbox.com/en-us/feed/?tag=free-play-days";
const CATALOG_BASE = "https://displaycatalog.mp.microsoft.com/v7.0/products";

async function fetchText(url: string, timeoutMs = 9000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": BROWSER_UA, Accept: "application/xml,text/html,*/*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export function parseFpdGames(xml: string): any[] {
  if (typeof xml !== "string" || !xml) return [];
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return [];
  const item = itemMatch[1];
  const encMatch =
    item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) ||
    item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
  if (!encMatch) return [];
  const body = encMatch[1];

  const re = /href="(https:\/\/www\.xbox\.com\/[a-zA-Z-]+\/games\/store\/[a-z0-9-]+\/([A-Za-z0-9]{12})\/?)"/gi;
  const seen = new Set<string>();
  const out: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const url = m[1];
    const productId = m[2];
    if (seen.has(productId)) continue;
    seen.add(productId);
    const slugMatch = url.match(/\/store\/([a-z0-9-]+)\//i);
    out.push({ productId, slug: slugMatch ? slugMatch[1] : null });
  }
  return out;
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

export function parseEndDate(xml: string): string | null {
  if (typeof xml !== "string" || !xml) return null;
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;
  const item = itemMatch[1];

  const encMatch =
    item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) ||
    item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
  if (!encMatch) return null;
  const body = encMatch[1];

  const pubMatch = item.match(/<pubDate>[^<]*?(\d{4})[^<]*?<\/pubDate>/);
  const year = pubMatch ? Number(pubMatch[1]) : new Date().getFullYear();

  const patterns = [
    /through\s+([A-Za-z]+)\s+(\d{1,2})/i,
    /(?:until|through)\s+(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+([A-Za-z]+)\s+(\d{1,2})/i,
    /\b(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([A-Za-z]+)\s+(\d{1,2})/i,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (!m) continue;
    const monthName = m[1].toLowerCase();
    const day = Number(m[2]);
    const month = MONTHS[monthName];
    if (month == null || !Number.isFinite(day) || day < 1 || day > 31) continue;
    const d = new Date(Date.UTC(year, month, day));
    if (Number.isNaN(d.getTime())) continue;
    return d.toISOString();
  }
  return null;
}

function imageUrl(images: any): string | null {
  const image = Array.isArray(images)
    ? images.find((item: any) => item && item.ImagePurpose === "Poster") || images[0]
    : null;
  if (!image || !image.Uri) return null;
  return image.Uri.startsWith("//") ? `https:${image.Uri}` : image.Uri;
}

function normalizeId(value: any): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim() || null;
  return null;
}

function sanitizeCatalogEndDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw);
  if (s.startsWith("9998")) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function fetchXboxFree(opts: any = {}): Promise<any[]> {
  const market = opts.market || "US";
  const language = opts.language || "en-US";
  try {
    const xml = await fetchText(RSS_URL, 9000);
    const games = parseFpdGames(xml);
    if (games.length === 0) return [];

    const rssEndDate = parseEndDate(xml);

    const ids = games.map((g: any) => g.productId);
    const catalogParams = new URLSearchParams({
      bigIds: ids.join(","),
      market,
      languages: language,
    });
    const catalogUrl = `${CATALOG_BASE}?${catalogParams.toString()}`;
    const catalog = await fetchJson(catalogUrl, {
      timeoutMs: 9000,
      headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
    });
    const products = Array.isArray(catalog && catalog.Products) ? catalog.Products : [];

    const slugByPid = new Map<string, any>(games.map((g: any) => [g.productId.toLowerCase(), g.slug]));

    return products
      .map((product: any) => {
        const productId = product && normalizeId(product.ProductId);
        if (!productId) return null;
        const localized =
          (product.LocalizedProperties && product.LocalizedProperties[0]) || {};
        const availability =
          (product.DisplaySkuAvailabilities &&
            product.DisplaySkuAvailabilities[0] &&
            product.DisplaySkuAvailabilities[0].Availabilities &&
            product.DisplaySkuAvailabilities[0].Availabilities[0]) ||
          {};
        const price =
          (availability.OrderManagementData && availability.OrderManagementData.Price) ||
          {};
        const catalogEnd = sanitizeCatalogEndDate(
          availability.Conditions && availability.Conditions.EndDate,
        );
        const slug = slugByPid.get(productId.toLowerCase());
        return toGameDeal({
          id: `xbox-free-${productId}`,
          platform: "xbox",
          title: localized.ProductTitle || localized.ShortTitle || "Xbox 免费试玩",
          thumb: imageUrl(localized.Images),
          salePrice: 0,
          normalPrice: Number(price.MSRP) || null,
          savings: 100,
          currency: price.CurrencyCode || "USD",
          dealUrl: slug
            ? `https://www.xbox.com/en-US/games/store/${slug}/${productId}`
            : `https://www.microsoft.com/store/productId/${productId}`,
          isFree: true,
          freeUntil: rssEndDate || catalogEnd,
          store: "Microsoft Store",
          source: "live",
          promotionType: "free-play-days",
          requirements: "需 Game Pass，活动期间限时试玩",
          provider: "microsoft",
        });
      })
      .filter(Boolean);
  } catch (err) {
    logFetchError("xbox:free-play-days", err);
    return [];
  }
}

module.exports = { fetchXboxFree, parseFpdGames, parseEndDate };
