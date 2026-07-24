/**
 * src/main/games/playstation.ts
 *
 * PlayStation 优惠数据源 — 多级链路，全部免费、无需 key。
 */
"use strict";

const { toGameDeal, BROWSER_UA: UA } = require("./normalize.ts");
const { logFetchError } = require("./log.ts");
const os = require("os");
const fs = require("fs");
const path = require("path");

const PSGS_RAW_BASE =
  "https://raw.githubusercontent.com/RavelloH/PSGameSpider/main/data";
const PSGS_IMG_BASE =
  "https://raw.githubusercontent.com/RavelloH/PSGameSpider/main/origin";
const PSGS_REGION_FILE: Record<string, string> = { us: "en-us" };
const PSGS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PSGS_CACHE_DIR = path.join(os.tmpdir(), "pulse-psgs-cache");

const REGION_LOCALE: Record<string, string> = { us: "en-us" };
const STORE_BASE = "https://store.playstation.com";

function pick(re: RegExp, s: string, grp = 1): string | null {
  const mm = s.match(re);
  return mm ? mm[grp] : null;
}

function money(s: string | null): number | null {
  if (!s) return null;
  const v = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isNaN(v) ? null : v;
}

function decodeEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchText(url: string, timeoutMs = 9000): Promise<string> {
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

function cachePath(region: string, kind: string): string {
  return path.join(PSGS_CACHE_DIR, `${region}-${kind}.json`);
}

function readCache(region: string, kind: string): any {
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

async function writeCache(region: string, kind: string, data: any): Promise<void> {
  try {
    await fs.promises.mkdir(PSGS_CACHE_DIR, { recursive: true });
    await fs.promises.writeFile(cachePath(region, kind), JSON.stringify(data), "utf8");
  } catch (err) {
    logFetchError("playstation:cache:write", err);
  }
}

export async function loadPsGameSpiderData(region: string): Promise<any> {
  const reg = PSGS_REGION_FILE[region] || PSGS_REGION_FILE.us;

  let priceHistory = readCache(reg, "priceHistory");
  let metaData = readCache(reg, "metaData");

  try {
    if (!priceHistory) {
      priceHistory = JSON.parse(
        await fetchText(`${PSGS_RAW_BASE}/${reg}-priceHistory.json`),
      );
      writeCache(reg, "priceHistory", priceHistory).catch(() => {});
    }
    if (!metaData) {
      metaData = JSON.parse(
        await fetchText(`${PSGS_RAW_BASE}/${reg}-metaData.json`),
      );
      writeCache(reg, "metaData", metaData).catch(() => {});
    }
  } catch (err) {
    logFetchError("playstation:psgamespider", err);
    return null;
  }

  return { priceHistory, metaData };
}

export function buildDealsFromPsGameSpider(priceHistory: any, metaData: any, opts: any = {}): any[] {
  const limit = Math.min(Math.max(opts.limit || 40, 1), 100);

  const metaByName = new Map<string, any>();
  if (Array.isArray(metaData)) {
    for (const m of metaData) {
      if (m && m.name) metaByName.set(m.name, m);
    }
  }

  const deals: any[] = [];
  for (const [name, hist] of Object.entries(priceHistory) as [string, any][]) {
    if (!Array.isArray(hist) || hist.length < 2) continue;

    const pts = hist
      .filter((h: any) => Array.isArray(h) && typeof h[1] === "number" && h[1] > 0)
      .map((h: any) => ({ date: h[0], price: h[1] }));
    if (pts.length < 2) continue;

    const latest = pts[pts.length - 1].price;
    const max = Math.max(...pts.map((p: any) => p.price));
    const min = Math.min(...pts.map((p: any) => p.price));

    if (latest <= 0 || max <= 0 || max > 300) continue;
    if (!(latest < max)) continue;
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
      popular: Math.round((max - latest) * 100) / 100,
      lowestPrice: min,
    });
  }

  deals.sort((a, b) => (b.popular || 0) - (a.popular || 0));
  return deals.slice(0, limit).map((d) => toGameDeal(d));
}

export async function fetchPlayStationDeals(opts: any = {}): Promise<any[] | null> {
  const region = opts.region || "us";

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
  }

  try {
    const deals = await fetchPlayStationStoreDeals(opts);
    if (deals && deals.length > 0) return deals;
  } catch (err) {
    logFetchError("playstation:ssr", err);
  }

  return null;
}

export async function fetchPlayStationStoreDeals(opts: any = {}): Promise<any[] | null> {
  const region = opts.region || "us";
  const locale = REGION_LOCALE[region] || REGION_LOCALE.us;
  const limit = Math.min(Math.max(opts.limit || 40, 1), 60);
  try {
    const url = `${STORE_BASE}/${locale}/deals`;
    const html = await fetchText(url, 9000);
    const raw = parseDealsHtml(html);
    const items = raw
      .slice(0, limit)
      .map((r) => toGameDeal(r))
      .filter((it: any) => it.savings > 0 && it.normalPrice > 0);
    return items;
  } catch {
    return null;
  }
}

export function parseDealsHtml(html: string): any[] {
  const badgeRe = /discount-badge#text"[^>]*>([^<]+)</g;
  const deals: any[] = [];
  let m: RegExpExecArray | null;
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
    let name: string | null = null;
    let psId: string | null = null;
    let link: string | null = null;
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
  fetchPlayStationDeals,
  fetchPlayStationStoreDeals,
  parseDealsHtml,
  buildDealsFromPsGameSpider,
  loadPsGameSpiderData,
  PSGS_RAW_BASE,
  PSGS_IMG_BASE,
  STORE_BASE,
};
