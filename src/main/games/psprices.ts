/**
 * src/main/games/psprices.ts
 *
 * PlayStation 优惠数据源 — 第三方 PSPrices B2B API（用户选定的方案 2）。
 */
"use strict";

const { toGameDeal, fetchJson } = require("./normalize");
const { logFetchError } = require("./log");

const PSPRICES_BASE = "https://psprices.com/api/b2b";
const DEFAULT_REGION = "us";
const DEFAULT_PLATFORMS = "ps5,ps4";

let _envLoaded = false;
function loadEnvPspricesKey(): void {
  if (_envLoaded) return;
  _envLoaded = true;
  if (process.env.PSPRICES_API_KEY) return;
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const txt = fs.readFileSync(envPath, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*PSPRICES_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (v) process.env.PSPRICES_API_KEY = v;
        break;
      }
    }
  } catch (err) {
    logFetchError("psprices:env", err);
  }
}

function mapItem(item: any): any {
  const p = item.pricing || {};
  const current = Number(p.current_price);
  const original = Number(p.original_price);
  const cut = Number(p.discount_percent || 0);
  return toGameDeal({
    id: `ps-${item.sku || item.title_id || item.id}`,
    platform: "playstation",
    title: item.name || "未知游戏",
    thumb: item.cover || null,
    salePrice: current,
    normalPrice: original,
    savings: cut,
    currency: p.currency || "USD",
    dealUrl: item.ps_store_url || item.store_url || null,
    isFree: current === 0,
    releaseDate: item.release_date || null,
    store: "PlayStation Store",
    source: "live",
    popular: cut,
  });
}

export async function fetchPlayStationDeals(opts: any = {}): Promise<any[] | null> {
  loadEnvPspricesKey();
  const key = opts.apiKey || process.env.PSPRICES_API_KEY;
  if (!key) return null;
  const region = opts.region || DEFAULT_REGION;
  const platforms = opts.platforms || DEFAULT_PLATFORMS;
  const limit = Math.min(Math.max(opts.limit || 40, 1), 100);
  const mode = opts.mode || "deals";
  try {
    const url = `${PSPRICES_BASE}/games/?region=${encodeURIComponent(
      region,
    )}&platforms=${encodeURIComponent(platforms)}&limit=${limit}`;
    const data = await fetchJson(url, {
      timeoutMs: 9000,
      headers: { "X-API-Key": key, Accept: "application/json" },
    });
    const list = Array.isArray(data?.data) ? data.data : [];
    const items = list
      .map(mapItem)
      .filter((it: any) =>
        mode === "free"
          ? it.isFree
          : it.savings > 0 && it.normalPrice > 0,
      );
    return items;
  } catch (err) {
    logFetchError("psprices", err);
    return null;
  }
}

module.exports = {
  fetchPlayStationDeals,
  PSPRICES_BASE,
};
