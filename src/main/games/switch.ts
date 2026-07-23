/**
 * src/main/games/switch.ts
 *
 * Nintendo eShop (Switch) 折扣数据 — 走 Nintendo 官方 Algolia 搜索后端。
 */
"use strict";

const { toGameDeal, BROWSER_UA_SAFARI: UA } = require("./normalize");
const { logFetchError } = require("./log");

const ALGOLIA_APP_ID = "U3B6GR4UA3";
const ALGOLIA_API_KEY = "a29c6927638bfd8cee23993e51e721c9";
const ALGOLIA_INDEX = "store_all_products_en_us";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

const ATTRS = [
  "title",
  "price",
  "productImageSquare",
  "url",
  "urlKey",
  "nsuid",
  "releaseDate",
  "releaseDateDisplay",
  "objectID",
];

async function postJson(url: string, body: any, { timeoutMs = 9000, headers = {} }: any = {}): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchSwitchDeals(opts: any = {}): Promise<any[]> {
  const limit = Math.min(Math.max(opts.limit || 40, 1), 50);
  const filter =
    opts.mode === "free"
      ? 'platform:"Nintendo Switch" AND price.finalPrice=0'
      : 'platform:"Nintendo Switch" AND price.percentOff>0';
  try {
    const data = await postJson(
      `${ALGOLIA_URL}?x-algolia-agent=Algolia%20for%20JavaScript%20(3.33.0)%3B%20Browser&x-algolia-application-id=${ALGOLIA_APP_ID}&x-algolia-api-key=${ALGOLIA_API_KEY}`,
      {
        query: "",
        hitsPerPage: limit,
        page: 0,
        attributesToRetrieve: ATTRS,
        filters: filter,
      },
      {
        timeoutMs: 10000,
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/json",
          Origin: "https://www.nintendo.com",
          Referer: "https://www.nintendo.com/",
        },
      },
    );

    const hits = Array.isArray(data && data.hits) ? data.hits : [];
    const items = hits
      .map((h: any) => {
        const price = h.price || {};
        const finalPrice = Number(price.finalPrice || 0);
        const regPrice = Number(price.regPrice || 0);
        const percentOff = Number(price.percentOff || 0);
        const savings = Math.round(percentOff);
        const isFree = finalPrice === 0;
        const dealUrl = h.url
          ? `https://www.nintendo.com${h.url}`
          : h.urlKey
            ? `https://www.nintendo.com/us/store/products/${h.urlKey}/`
            : "https://www.nintendo.com/store/";
        return toGameDeal({
          id: `switch-${h.nsuid || h.objectID}`,
          platform: "switch",
          title: h.title || "未知游戏",
          thumb: h.productImageSquare || null,
          salePrice: finalPrice,
          normalPrice: regPrice,
          savings: isFree ? 100 : savings,
          currency: "USD",
          dealUrl,
          isFree,
          rating: null,
          releaseDate: h.releaseDateDisplay || h.releaseDate || null,
          store: "Nintendo eShop",
          source: "live",
          popular: savings,
        });
      })
      .filter((it: any) => it.normalPrice > 0 || it.isFree);
    return items;
  } catch (err) {
    logFetchError("switch:algolia", err);
    return [];
  }
}

module.exports = { fetchSwitchDeals, ALGOLIA_INDEX };
