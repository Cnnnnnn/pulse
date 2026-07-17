/**
 * src/main/games/aggregator.js
 *
 * 聚合层 — 对外唯一入口 getGameDeals()。
 * renderer 传 { platform, mode, sort, minSavings }，这里负责：
 *   - 按平台分派到对应 fetcher (Steam/Epic 真实；主机 ITAD 或示例兜底)
 *   - 按 mode 过滤/排序：'deals'(折扣) | 'free'(喜+1) | 'top'(热门 Top10)
 *   - 返回统一结构 + 各平台数据源标记 (sources)，供 UI 显示"示例"徽标
 *
 * 单平台 fetch 失败不影响其它平台（Promise.allSettled + 兜底）。
 */

const { PLATFORM_KEYS, toGameDeal } = require("./normalize");
const { fetchSteamDeals } = require("./steam");
const { fetchEpicDeals, fetchEpicFree } = require("./epic");
const { fetchItadDeals } = require("./itad");
const { fetchSwitchDeals } = require("./switch");
// playstation.js 主入口：PSGameSpider（每日全量价格历史）→ 官方商店 SSR 兜底
const { fetchPlayStationDeals: fetchPsMain } = require("./playstation");
// psprices.js 备选：PSPrices B2B（需 key，许可强制署名）
const { fetchPlayStationDeals: fetchPsPsprices } = require("./psprices");
const { getSampleDeals } = require("./sample");

const CONSOLE_PLATFORMS = ["xbox", "playstation", "switch"];

/**
 * 取单个平台的优惠数据（含错误兜底）。
 * @returns {Promise<{items:object[], source:string}>}
 */
async function fetchPlatform(platform, { mode, sort, minSavings, country, itadKey }) {
  try {
    if (platform === "steam") {
      const items = await fetchSteamDeals({ sort, pageSize: 40, minSavings });
      return { items, source: "live" };
    }
    if (platform === "epic") {
      const [deals, free] = await Promise.all([
        fetchEpicDeals({ sort, pageSize: 40, minSavings }),
        mode === "free" || mode === "all" || mode === "top"
          ? fetchEpicFree({ country })
          : Promise.resolve([]),
      ]);
      return { items: deals.concat(free), source: "live" };
    }
    // 主机平台数据源分派：
    //   - switch: Nintendo 官方 Algolia（免密直连，真实折扣）优先，失败回退示例
    //   - playstation: 官方商店 SSR（免费、无 key）优先 → PSPrices（需 key）次选 → 示例兜底
    //   - xbox: ITAD（需 key）
    if (platform === "switch") {
      const live = await fetchSwitchDeals({ limit: 40, country, mode });
      if (live && live.length > 0) return { items: live, source: "live" };
      return { items: getSampleDeals("switch"), source: "sample" };
    }
    if (platform === "playstation") {
      // 1) PSGameSpider（每日全量价格历史，免费）→ SSR 兜底（在 fetcher 内部）
      const main = await fetchPsMain({ limit: 40, region: "us", mode });
      if (main && main.length > 0) {
        return { items: main, source: "live", psDriver: "psgamespider" };
      }
      // 2) PSPrices B2B（需 key，许可强制署名）
      const psLive = await fetchPsPsprices({
        limit: 40,
        region: "us",
        mode,
      });
      if (psLive && psLive.length > 0) {
        return { items: psLive, source: "live", psDriver: "psprices" };
      }
      // 3) 示例兜底
      return {
        items: getSampleDeals("playstation"),
        source: "sample",
        psDriver: null,
      };
    }
    const live = await fetchItadDeals(platform, {
      key: itadKey,
      country,
      limit: 40,
    });
    if (live && live.length > 0) return { items: live, source: "live" };
    return { items: getSampleDeals(platform), source: "sample" };
  } catch (err) {
    // 任何异常：主机用示例兜底，PC 平台返回空（不至于整页崩）
    if (CONSOLE_PLATFORMS.includes(platform)) {
      return { items: getSampleDeals(platform), source: "sample" };
    }
    return { items: [], source: "live" };
  }
}

function sortDeals(items, sort) {
  const arr = items.slice();
  if (sort === "price") {
    arr.sort((a, b) => (a.salePrice ?? Infinity) - (b.salePrice ?? Infinity));
  } else if (sort === "rating") {
    arr.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  } else {
    // 'savings' 默认：折扣力度降序
    arr.sort((a, b) => b.savings - a.savings);
  }
  return arr;
}

/**
 * @param {{platform?:string, mode?:string, sort?:string, minSavings?:number, country?:string, itadKey?:string}} opts
 * @returns {Promise<object>}
 */
async function getGameDeals(opts = {}) {
  const {
    platform = "all",
    mode = "deals",
    sort = "savings",
    minSavings = 0,
    country = "CN",
    itadKey = null,
  } = opts;

  const platforms =
    platform === "all" ? PLATFORM_KEYS.slice() : [platform].filter((p) => PLATFORM_KEYS.includes(p));

  const results = await Promise.all(
    platforms.map((p) =>
      fetchPlatform(p, { mode, sort, minSavings, country, itadKey }).then(
        (r) => [p, r],
      ),
    ),
  );

  const sources = {};
  let psDriver = null;
  let items = [];
  for (const [p, r] of results) {
    sources[p] = r.source;
    if (p === "playstation") psDriver = r.psDriver || null;
    items = items.concat(r.items);
  }

  // 去重（按 id）
  const seen = new Set();
  items = items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });

  if (mode === "free") {
    items = items.filter((it) => it.isFree);
  } else if (mode === "top") {
    items = items.slice().sort((a, b) => b.popular - a.popular).slice(0, 10);
  } else {
    // deals / all：按折扣门槛过滤 + 排序
    if (minSavings > 0) {
      items = items.filter((it) => it.savings >= minSavings);
    }
    items = sortDeals(items, sort);
  }

  return {
    ok: true,
    platform,
    mode,
    items,
    sources,
    psDriver,
    count: items.length,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getGameDeals };
