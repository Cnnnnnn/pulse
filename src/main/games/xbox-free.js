/**
 * src/main/games/xbox-free.js
 *
 * Xbox Free Play Days（Game Pass 会员限时免费试玩）。
 *
 * 数据源（旧 reco-public.rec.mp.microsoft.com 端点已被微软下线，DNS 解析到
 * ust-deprecated → 0.0.0.0；改用 news.xbox.com 官方 RSS + displaycatalog）：
 *   1) news.xbox.com/en-us/feed/?tag=free-play-days  — 每周末更新的 WordPress RSS
 *      每篇文章 <content:encoded> 里嵌有指向 store 页的链接，URL 末段为 12 位 productId
 *   2) displaycatalog.mp.microsoft.com/v7.0/products — 用 productId 拉 MSRP/封面/EndDate
 *
 * 只取 RSS 第一篇 item（pubDate 最近，即当前活动）；后续是历史归档。
 */

const { fetchJson, toGameDeal, BROWSER_UA } = require("./normalize");
const { logFetchError } = require("./log");

const RSS_URL = "https://news.xbox.com/en-us/feed/?tag=free-play-days";
const CATALOG_BASE = "https://displaycatalog.mp.microsoft.com/v7.0/products";

/** 带超时的 text fetch（与 playstation.js 的 fetchText 同款，文件内私有）。 */
async function fetchText(url, timeoutMs = 9000) {
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

/**
 * 从 RSS 提取首篇 item 的正文里所有 store 链接 → [{ productId, slug }]。
 * 链接格式：https://www.xbox.com/<locale>/games/store/<slug>/<12位bigId>/?
 * 跨 locale（en-US/en-GB 等）通配；同 productId 去重；非 store 路径的 xbox.com 链接忽略。
 */
function parseFpdGames(xml) {
  if (typeof xml !== "string" || !xml) return [];
  // 取第一个 <item>（RSS 默认按 pubDate 倒序，首篇即当前活动）
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return [];
  const item = itemMatch[1];
  const encMatch =
    item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) ||
    item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
  if (!encMatch) return [];
  const body = encMatch[1];

  // productId 是 12 位字母数字，大小写混合（如 bx03760d0qgn / 9NKC1Z4Z92VN）
  const re = /href="(https:\/\/www\.xbox\.com\/[a-zA-Z-]+\/games\/store\/[a-z0-9-]+\/([A-Za-z0-9]{12})\/?)"/gi;
  const seen = new Set();
  const out = [];
  let m;
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

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * 从 RSS 首篇 item 正文解析活动结束日期 → ISO 字符串 或 null。
 * 匹配 "through <Month> <Day>" 或 "<Weekday>, <Month> <Day>"。
 * 年份取首篇 pubDate 的年份（避免跨年歧义）。
 */
function parseEndDate(xml) {
  if (typeof xml !== "string" || !xml) return null;
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;
  const item = itemMatch[1];

  const encMatch =
    item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) ||
    item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
  if (!encMatch) return null;
  const body = encMatch[1];

  // pubDate 取年份
  const pubMatch = item.match(/<pubDate>[^<]*?(\d{4})[^<]*?<\/pubDate>/);
  const year = pubMatch ? Number(pubMatch[1]) : new Date().getFullYear();

  // 模式 1: "through <Month> <Day>"
  // 模式 2: "<Weekday>, <Month> <Day>"
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

function imageUrl(images) {
  const image = Array.isArray(images)
    ? images.find((item) => item && item.ImagePurpose === "Poster") || images[0]
    : null;
  if (!image || !image.Uri) return null;
  return image.Uri.startsWith("//") ? `https:${image.Uri}` : image.Uri;
}

function normalizeId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim() || null;
  return null;
}

/** catalog 返回的 EndDate 为 9998-12-30 时视为"无结束日期"占位符。 */
function sanitizeCatalogEndDate(raw) {
  if (!raw) return null;
  const s = String(raw);
  if (s.startsWith("9998")) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Xbox Free Play Days（Game Pass 会员限时免费试玩）。 */
async function fetchXboxFree(opts = {}) {
  const market = opts.market || "US";
  const language = opts.language || "en-US";
  try {
    const xml = await fetchText(RSS_URL, 9000);
    const games = parseFpdGames(xml);
    if (games.length === 0) return [];

    const rssEndDate = parseEndDate(xml);

    const ids = games.map((g) => g.productId);
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
    const products = Array.isArray(catalog && catalog.Products) ? catalog.Products : [];

    // 按 productId 索引 RSS 解析出的 slug（catalog 不返回 store slug）
    // productId 大小写不一致（RSS 小写 bx03760d0qgn / catalog 大写 BX03760D0QGN），统一小写做 key
    const slugByPid = new Map(games.map((g) => [g.productId.toLowerCase(), g.slug]));

    return products
      .map((product) => {
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
          // 优先用 RSS 文章里解析出的结束日期（更准确），catalog EndDate 仅作回退
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
