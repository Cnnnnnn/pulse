const { fetchJson, toGameDeal, BROWSER_UA } = require("./normalize");
const { logFetchError } = require("./log");

const LIST_BASE =
  "https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/collection/FreePlayDays";
const CATALOG_BASE = "https://displaycatalog.mp.microsoft.com/v7.0/products";

function imageUrl(images) {
  const image = Array.isArray(images)
    ? images.find((item) => item.ImagePurpose === "Poster") || images[0]
    : null;
  if (!image || !image.Uri) return null;
  return image.Uri.startsWith("//") ? `https:${image.Uri}` : image.Uri;
}

function normalizeId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim() || null;
  return null;
}

async function fetchXboxFree(opts = {}) {
  const market = opts.market || "US";
  const language = opts.language || "en-US";
  try {
    const listUrl = new URL(LIST_BASE);
    listUrl.search = new URLSearchParams({
      market,
      language,
      itemTypes: "Game",
      deviceFamily: "Windows.Xbox",
      count: "50",
      skipItems: "0",
    });
    const list = await fetchJson(listUrl.toString(), {
      timeoutMs: 9000,
      headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
    });
    const ids = Array.isArray(list && list.Items)
      ? list.Items.map((item) => item && normalizeId(item.Id)).filter(Boolean)
      : [];
    if (ids.length === 0) return [];

    const catalogUrl = new URL(CATALOG_BASE);
    catalogUrl.search = new URLSearchParams({
      bigIds: ids.join(","),
      market,
      languages: language,
    });
    const catalog = await fetchJson(catalogUrl.toString(), {
      timeoutMs: 9000,
      headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
    });
    const products = Array.isArray(catalog && catalog.Products)
      ? catalog.Products
      : [];

    return products.map((product) => {
      const productId = product && normalizeId(product.ProductId);
      if (!productId) return null;
      const localized = product.LocalizedProperties && product.LocalizedProperties[0] || {};
      const availability =
        product.DisplaySkuAvailabilities &&
        product.DisplaySkuAvailabilities[0] &&
        product.DisplaySkuAvailabilities[0].Availabilities &&
        product.DisplaySkuAvailabilities[0].Availabilities[0] || {};
      const price = availability.OrderManagementData &&
        availability.OrderManagementData.Price || {};
      return toGameDeal({
        id: `xbox-free-${productId}`,
        platform: "xbox",
        title: localized.ProductTitle || localized.ShortTitle || "Xbox 免费试玩",
        thumb: imageUrl(localized.Images),
        salePrice: 0,
        normalPrice: Number(price.MSRP) || null,
        savings: 100,
        currency: price.CurrencyCode || "USD",
        dealUrl: `https://www.microsoft.com/store/productId/${productId}`,
        isFree: true,
        freeUntil: availability.Conditions && availability.Conditions.EndDate || null,
        store: "Microsoft Store",
        source: "live",
        promotionType: "free-play-days",
        requirements: "需 Game Pass，活动期间限时试玩",
        provider: "microsoft",
      });
    }).filter(Boolean);
  } catch (err) {
    logFetchError("xbox:free-play-days", err);
    return [];
  }
}

module.exports = { fetchXboxFree };
