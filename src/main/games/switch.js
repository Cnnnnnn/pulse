/**
 * src/main/games/switch.js
 *
 * Nintendo eShop (Switch) 折扣数据 — 走 Nintendo 官方 Algolia 搜索后端 (免密，公开 search key)。
 * 实测结论 (2026-07-17)：
 *   - 旧 ec.nintendo.com/api/.../search/sales 接口已下线 (404)，现统一走 Algolia。
 *   - 索引 store_all_products_en_us 自带完整字段：title / price{finalPrice, regPrice,
 *     salePrice, percentOff, discounted} / productImageSquare(封面URL) / url(详情页相对路径)
 *     / nsuid / releaseDate / releaseDateDisplay。一次查询即可，无需跨索引合并。
 *   - 过滤条件 platform:"Nintendo Switch" AND price.percentOff>0 直接返回在售折扣游戏
 *     （约 1000 个，分页 nbPages~20）。价格单位为美元。
 *   - 需要带 Origin/Referer 头（Nintendo 站点的 Algolia 校验来源），否则 403。
 *   - 该索引 objectID 为数字 (7100126981)，与旧索引 ncom_game_en_us(UUID) 不互通，
 *     但本索引已含封面与链接，无需旧索引。
 *
 * 返回规范化的 GameDeal 数组 (source:'live')；失败/无数据返回 []，由聚合层回退示例。
 */

const { toGameDeal } = require("./normalize");
const { logFetchError } = require("./log");

// Algolia 凭据提取自 Nintendo 美国官网公开请求（只读 search key，无写入权限）。
const ALGOLIA_APP_ID = "U3B6GR4UA3";
const ALGOLIA_API_KEY = "a29c6927638bfd8cee23993e51e721c9";
const ALGOLIA_INDEX = "store_all_products_en_us";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

// 需要取的字段（其余忽略，减少传输）。
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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** 带超时 + 错误捕获的 POST 封装。 */
async function postJson(url, body, { timeoutMs = 9000, headers = {} } = {}) {
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

/**
 * 取 Switch 在售折扣 / 免费游戏。
 * @param {{limit?:number, country?:string, mode?:string}} opts
 *   mode 'free' → 免费畅玩 (finalPrice=0)；其余 → 折扣 (percentOff>0)
 * @returns {Promise<object[]>} 规范化 GameDeal 数组 (source:'live')，失败返回 []
 */
async function fetchSwitchDeals(opts = {}) {
  const limit = Math.min(Math.max(opts.limit || 40, 1), 50); // Algolia 单页上限保护
  // 免费 / 折扣走不同过滤条件（避免括号 OR 语法，该 Algolia 版本不支持）。
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
      .map((h) => {
        const price = h.price || {};
        const finalPrice = Number(price.finalPrice || 0);
        const regPrice = Number(price.regPrice || 0);
        const percentOff = Number(price.percentOff || 0);
        // 折扣力度（整数百分比），如 50.04 -> 50
        const savings = Math.round(percentOff);
        const isFree = finalPrice === 0; // 免费畅玩 (free-to-start) 类
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
          rating: null, // Algolia 索引无评分字段
          releaseDate: h.releaseDateDisplay || h.releaseDate || null,
          store: "Nintendo eShop",
          source: "live",
          // 折扣力度作热门度代理
          popular: savings,
        });
      })
      .filter((it) => it.normalPrice > 0 || it.isFree);
    return items;
  } catch (err) {
    logFetchError("switch:algolia", err);
    return [];
  }
}

module.exports = { fetchSwitchDeals, ALGOLIA_INDEX };
