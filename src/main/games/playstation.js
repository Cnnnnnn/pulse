/**
 * src/main/games/playstation.js
 *
 * PlayStation 优惠数据源 — 多级链路，全部免费、无需 key：
 *   1. PSGameSpider（主源）：消费 github.com/RavelloH/PSGameSpider 每日由
 *      GitHub Actions 自动爬取并以 JSON 形式发布的全平台 PS Store 价格历史。
 *      raw.githubusercontent.com 不被 WAF 拦截，Node fetch 可直连。
 *      覆盖 ~15k 游戏、~3k 当前折扣；含价格历史，本地算真实折扣%。
 *      6 小时本地缓存，避免重复拉 4.5MB。
 *   2. 官方商店页 SSR（兜底 1）：store.playstation.com/en-us/deals 服务端渲染
 *      首屏折扣磁贴（约 7~12 条），免费无 key。
 *   3. PSPrices B2B（兜底 2，需 key，见 psprices.js）
 *   4. 示例（聚合层兜底，见 aggregator.js）
 *
 * 背景与实测结论 (2026-07-17)：
 *   - 公开 chihiro API 不暴露 PS 折扣字段。
 *   - 官方 GraphQL web.np.playstation.com/api/graphql/v1 被 Akamai WAF 拦 403。
 *   - 第三方 psdeals.net 被 Cloudflare JS 质询拦截，Node fetch 不可用。
 *   - PSGameSpider 用 cheerio 爬 store.playstation.com/{lang}/pages/browse 全量
 *     游戏详情页，从 #mfe-jsonld-tags 提取价格，每日累积 priceHistory。
 *     我们只消费它发布在 GitHub 的 JSON，不自己爬。
 */

const { toGameDeal, BROWSER_UA: UA } = require("./normalize");
const { logFetchError } = require("./log");
const os = require("os");
const fs = require("fs");
const path = require("path");

// ── PSGameSpider 数据源 ────────────────────────────────────────────
const PSGS_RAW_BASE =
  "https://raw.githubusercontent.com/RavelloH/PSGameSpider/main/data";
const PSGS_IMG_BASE =
  "https://raw.githubusercontent.com/RavelloH/PSGameSpider/main/origin";
const PSGS_REGION_FILE = { us: "en-us" }; // 生产仅 us/USD
const PSGS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时
const PSGS_CACHE_DIR = path.join(os.tmpdir(), "pulse-psgs-cache");

// ── 官方商店 SSR 兜底 ──────────────────────────────────────────────
const REGION_LOCALE = { us: "en-us" };
const STORE_BASE = "https://store.playstation.com";

// ── 通用工具 ───────────────────────────────────────────────────────
function pick(re, s, grp = 1) {
  const mm = s.match(re);
  return mm ? mm[grp] : null;
}

function money(s) {
  if (!s) return null;
  const v = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isNaN(v) ? null : v;
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/html,*/*" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ── PSGameSpider 缓存 ──────────────────────────────────────────────
function cachePath(region, kind) {
  return path.join(PSGS_CACHE_DIR, `${region}-${kind}.json`);
}

function readCache(region, kind) {
  try {
    const p = cachePath(region, kind);
    const stat = fs.statSync(p);
    if (Date.now() - stat.mtimeMs > PSGS_CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    logFetchError("playstation:cache:read", err);
    return null;
  }
}

function writeCache(region, kind, data) {
  try {
    if (!fs.existsSync(PSGS_CACHE_DIR)) fs.mkdirSync(PSGS_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath(region, kind), JSON.stringify(data), "utf8");
  } catch (err) {
    logFetchError("playstation:cache:write", err);
    /* 缓存写入失败不影响主流程 */
  }
}

/**
 * 拉取并缓存 PSGameSpider 的 priceHistory + metaData，按 name 关联。
 * @returns {Promise<{priceHistory:object, metaData:object[]}|null>}
 */
async function loadPsGameSpiderData(region) {
  const reg = PSGS_REGION_FILE[region] || PSGS_REGION_FILE.us;

  // 1. 读缓存
  let priceHistory = readCache(reg, "priceHistory");
  let metaData = readCache(reg, "metaData");

  // 2. 缺失则拉远程
  try {
    if (!priceHistory) {
      priceHistory = JSON.parse(
        await fetchText(`${PSGS_RAW_BASE}/${reg}-priceHistory.json`),
      );
      writeCache(reg, "priceHistory", priceHistory);
    }
    if (!metaData) {
      // metaData 是数组
      metaData = JSON.parse(
        await fetchText(`${PSGS_RAW_BASE}/${reg}-metaData.json`),
      );
      writeCache(reg, "metaData", metaData);
    }
  } catch (err) {
    logFetchError("playstation:psgamespider", err);
    return null;
  }

  return { priceHistory, metaData };
}

/**
 * 把 PSGameSpider 价格历史 + 元数据 → 真实折扣 GameDeal 数组。
 *
 * 折扣计算：原价=历史最高价、现价=最新一条非空价、折扣%=差值/原价。
 * Sanity check：
 *   - latest > 0（排除免费/未上架）
 *   - max > 0 且 ≤ 300（排除 $2799 这类数据错误）
 *   - discount% 在 5~95（排除异常 100% / 微小波动）
 *   - 至少 2 个有效价格点
 */
function buildDealsFromPsGameSpider(priceHistory, metaData, opts = {}) {
  const limit = Math.min(Math.max(opts.limit || 40, 1), 100);

  // metaData → name 索引
  const metaByName = new Map();
  if (Array.isArray(metaData)) {
    for (const m of metaData) {
      if (m && m.name) metaByName.set(m.name, m);
    }
  }

  const deals = [];
  for (const [name, hist] of Object.entries(priceHistory)) {
    if (!Array.isArray(hist) || hist.length < 2) continue;

    // 提取所有有效价格点
    const pts = hist
      .filter((h) => Array.isArray(h) && typeof h[1] === "number" && h[1] > 0)
      .map((h) => ({ date: h[0], price: h[1] }));
    if (pts.length < 2) continue;

    const latest = pts[pts.length - 1].price;
    const max = Math.max(...pts.map((p) => p.price));
    const min = Math.min(...pts.map((p) => p.price));

    // sanity check
    if (latest <= 0 || max <= 0 || max > 300) continue;
    if (!(latest < max)) continue; // 必须真折扣
    const discPct = Math.round((1 - latest / max) * 100);
    if (discPct < 5 || discPct > 95) continue;

    const meta = metaByName.get(name) || {};
    const fullname = meta.fullname || name;
    const dealUrl = meta.path || null;
    const thumb = meta.img
      ? `${PSGS_IMG_BASE}/${String(meta.img).replace(/^\/+/, "")}`
      : null;
    const platform = "playstation";
    const store = "PlayStation Store";
    const rating = meta.rate ? parseFloat(meta.rate) : null;
    const releaseDate = meta.releaseTime || null;

    deals.push({
      id: `ps-${name}`,
      name: fullname,
      title: fullname,
      thumb,
      salePrice: latest,
      normalPrice: max,
      savings: discPct,
      currency: "USD",
      dealUrl,
      isFree: false,
      releaseDate,
      store,
      platform,
      source: "live",
      rating: !isNaN(rating) ? rating : null,
      popular: Math.round((max - latest) * 100) / 100, // 折扣绝对值（USD），用于排序
      lowestPrice: min,
    });
  }

  // 按折扣绝对值降序，取 top limit
  deals.sort((a, b) => (b.popular || 0) - (a.popular || 0));
  return deals.slice(0, limit).map((d) => toGameDeal(d));
}

/**
 * 主入口：PSGameSpider → SSR 兜底 → 返回 null（让聚合层走 PSPrices/sample）
 * @param {{limit?:number, region?:string, mode?:string}} opts
 * @returns {Promise<object[]|null>}
 */
async function fetchPlayStationDeals(opts = {}) {
  const region = opts.region || "us";

  // 1. PSGameSpider 主源
  try {
    const data = await loadPsGameSpiderData(region);
    if (data) {
      const deals = buildDealsFromPsGameSpider(
        data.priceHistory,
        data.metaData,
        opts,
      );
      if (deals.length > 0) return deals;
    }
  } catch (err) {
    logFetchError("playstation:psgamespider:main", err);
    /* 落到 SSR 兜底 */
  }

  // 2. 官方商店 SSR 兜底
  try {
    const deals = await fetchPlayStationStoreDeals(opts);
    if (deals && deals.length > 0) return deals;
  } catch (err) {
    logFetchError("playstation:ssr", err);
    /* 落到聚合层兜底 */
  }

  return null;
}

// ── 官方商店 SSR 兜底实现（原 v1 路径，保留）──────────────────────
async function fetchPlayStationStoreDeals(opts = {}) {
  const region = opts.region || "us";
  const locale = REGION_LOCALE[region] || REGION_LOCALE.us;
  const limit = Math.min(Math.max(opts.limit || 40, 1), 60);
  try {
    const url = `${STORE_BASE}/${locale}/deals`;
    const html = await fetchText(url, 12000);
    const raw = parseDealsHtml(html);
    const items = raw
      .slice(0, limit)
      .map((r) => toGameDeal(r))
      .filter((it) => it.savings > 0 && it.normalPrice > 0);
    return items;
  } catch {
    return null;
  }
}

function parseDealsHtml(html) {
  const badgeRe = /discount-badge#text"[^>]*>([^<]+)</g;
  const deals = [];
  let m;
  while ((m = badgeRe.exec(html))) {
    const bIdx = m.index;
    const discTxt = m[1];
    const disc = parseInt(discTxt.replace(/[^0-9]/g, ""), 10);
    if (isNaN(disc)) continue;

    const fwd = html.slice(bIdx, bIdx + 3000);
    const sale = money(pick(/price#display-price"[^>]*>([^<]+)</, fwd));
    const normal = money(pick(/price#price-strikethrough"[^>]*>([^<]+)</, fwd));
    if (!normal || !sale || !(normal > sale)) continue;

    const metaTag = pick(/<a\s+([^>]*?data-telemetry-meta="[^"]+"[^>]*?)>/, fwd);
    let name = null;
    let psId = null;
    let link = null;
    if (metaTag) {
      link = pick(/href="([^"]+)"/, metaTag);
      const meta = pick(/data-telemetry-meta="([^"]+)"/, metaTag);
      if (meta) {
        try {
          const j = JSON.parse(
            meta.replace(/&quot;/g, '"').replace(/&#x27;/g, "'"),
          );
          name = j.name || null;
          psId = j.id || j.titleId || null;
        } catch {
          /* 解析失败忽略 */
        }
      }
    }

    const back = html.slice(Math.max(0, bIdx - 3000), bIdx);
    const img = pick(/game-art#image#preview"[^>]*src="([^"]+)"/, back);
    const plat = pick(/game-art#tag0"[^>]*>([^<]+)</, back);

    const cleanName = name ? decodeEntities(name) : null;

    deals.push({
      id: `ps-${psId || cleanName || deals.length}`,
      name: cleanName || "PlayStation 优惠",
      title: cleanName || "PlayStation 优惠",
      thumb: img ? img.split("?")[0] : null,
      salePrice: sale,
      normalPrice: normal,
      savings: disc,
      currency: "USD",
      dealUrl: link ? STORE_BASE + link : null,
      isFree: false,
      releaseDate: null,
      store: "PlayStation Store",
      platform: "playstation",
      source: "live",
      popular: disc,
      _plat: plat,
    });
  }
  return deals;
}

module.exports = {
  fetchPlayStationDeals, // 主入口（PSGameSpider 优先 + SSR 兜底）
  fetchPlayStationStoreDeals, // 仅 SSR（兜底，暴露给测试）
  parseDealsHtml, // SSR 解析器（暴露给测试）
  buildDealsFromPsGameSpider, // PSGameSpider 数据 → deals（暴露给测试）
  loadPsGameSpiderData, // 拉取 + 缓存（暴露给测试）
  PSGS_RAW_BASE,
  PSGS_IMG_BASE,
  STORE_BASE,
};
