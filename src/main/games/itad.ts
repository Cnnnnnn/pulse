/**
 * src/main/games/itad.ts
 *
 * IsThereAnyDeal (ITAD) 适配器 — 覆盖 CheapShark 不支持的主机平台。
 */
"use strict";

const { toGameDeal, fetchJson } = require("./normalize");
const { logFetchError } = require("./log");

const SHOP_BY_PLATFORM: Record<string, number> = {
  xbox: 48,
};

const ITAD_DEALS = "https://api.isthereanydeal.com/deals/v2";
const ITAD_PRICES = "https://api.isthereanydeal.com/v01/prices/";

let _envLoaded = false;
function loadEnvItadKey(): void {
  if (_envLoaded) return;
  _envLoaded = true;
  if (process.env.ITAD_API_KEY) return;
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const txt = fs.readFileSync(envPath, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*ITAD_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (v) process.env.ITAD_API_KEY = v;
        break;
      }
    }
  } catch (err) {
    logFetchError("itad:env", err);
  }
}

export async function fetchItadDeals(platform: string, opts: any = {}): Promise<any[] | null> {
  loadEnvItadKey();
  const key = opts.key || process.env.ITAD_API_KEY;
  if (!key) return null;
  const shopId = SHOP_BY_PLATFORM[platform];
  if (shopId == null) return null;
  try {
    const params = new URLSearchParams({
      key,
      shops: String(shopId),
      limit: String(opts.limit || 40),
      country: opts.country || "US",
    });
    const data = await fetchJson(`${ITAD_DEALS}?${params.toString()}`, {
      timeoutMs: 9000,
    });
    const list = Array.isArray(data?.list) ? data.list : [];
    const items = list
      .map((item: any) => {
        const deal = item.deal || {};
        const price = Number(deal.price?.amount || 0);
        const regular = Number(deal.regular?.amount || 0);
        const cut = Number(deal.cut || 0);
        const slug = item.slug || item.id;
        const assets = item.assets || {};
        return toGameDeal({
          id: `${platform}-${slug || deal.shop?.id}`,
          platform,
          title: item.title || "未知游戏",
          thumb:
            assets.boxart || assets.banner145 || assets.banner300 || null,
          salePrice: price,
          normalPrice: regular,
          savings: cut,
          currency: deal.price?.currency || "USD",
          dealUrl: deal.url || null,
          store: deal.shop?.name || "Microsoft Store",
          source: "live",
          popular: cut,
        });
      })
      .filter((it: any) => it.normalPrice > 0);
    return items;
  } catch (err) {
    logFetchError(`itad:${platform}`, err);
    return null;
  }
}

export async function fetchItadLowest(slugs: string[], opts: any = {}): Promise<Record<string, number>> {
  const key = opts.key;
  if (!key || !Array.isArray(slugs) || slugs.length === 0) return {};
  const result: Record<string, number> = {};
  const BATCH = 30;
  try {
    for (let i = 0; i < slugs.length; i += BATCH) {
      const batch = slugs.slice(i, i + BATCH);
      const params = new URLSearchParams({ key, plains: batch.join(",") });
      const data = await fetchJson(`${ITAD_PRICES}?${params.toString()}`, {
        timeoutMs: 9000,
      });
      if (data && typeof data === "object") {
        for (const slug of batch) {
          const entry = data[slug];
          const amount = entry && entry.historyLow && entry.historyLow.amount;
          if (amount != null && Number.isFinite(Number(amount))) {
            result[slug] = Number(amount);
          }
        }
      }
    }
  } catch (err) {
    logFetchError("itad:prices", err);
  }
  return result;
}

module.exports = { fetchItadDeals, fetchItadLowest, SHOP_BY_PLATFORM };
