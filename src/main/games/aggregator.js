/**
 * src/main/games/aggregator.js
 *
 * 聚合层 — 对外唯一入口 getGameDeals()。
 * renderer 传 { platform, mode, sort, minSavings }，这里负责：
 *   - 按平台分派到对应 fetcher (Steam/Epic 真实；主机 ITAD 或示例兜底)
 *   - 按 mode 过滤/排序：'deals'(折扣) | 'free'(喜+1) | 'top'(热门 Top10)
 *   - 返回统一结构 + 各平台数据源标记 (sources)，供 UI 显示"示例"徽标
 *
 * 单平台 fetch 失败不影响其它平台（Promise.all + fetchPlatform 内部 try/catch 兜底）。
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
 * 标题归一化：小写 + 去标点/版本后缀 + 压空格。
 * 仅用于跨平台去重的 key 生成，不做同义词合并（避免把不同游戏误判为同一款）。
 * 例："GTA V: Premium Edition" → "gta v premium edition"
 */
function normalizeTitle(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[:：\-—–_·,.()（）#!?？]/g, " ")
    .replace(/\b(deluxe|premium|ultimate|goty|standard|complete|edition|version|版|豪华版|年度版)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 跨平台去重的择优函数：savings 高者优先；savings 相同看 salePrice 低者优先；
 * 都相同保留原顺序（返回 false 表示 a 不比 prev 更好）。
 */
function betterDeal(a, b) {
  if (a.savings !== b.savings) return a.savings > b.savings;
  const pa = a.salePrice ?? Infinity;
  const pb = b.salePrice ?? Infinity;
  if (pa !== pb) return pa < pb;
  return false; // 稳定：不替换
}

/**
 * 热门 Top10 — 分平台配额（round-robin）。
 * 各平台 popular 量纲不同（Steam 评分 / PS 美元折扣额 / Switch 折扣%），
 * 跨平台直接 sort 无意义；改为每平台组内按 popular 降序，再轮询取头部，
 * 保证平台多样性与公平曝光。语义：「各平台热门精选」。
 */
function pickTopByPlatformQuota(allItems, total) {
  const groups = new Map(); // platform -> items[]
  for (const it of allItems) {
    if (!groups.has(it.platform)) groups.set(it.platform, []);
    groups.get(it.platform).push(it);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => (b.popular || 0) - (a.popular || 0));
  }
  // 按「各平台 popular 榜首」降序排列队列，让头部最强的平台先取
  const queues = [...groups.values()].sort(
    (qa, qb) => (qb[0]?.popular || 0) - (qa[0]?.popular || 0),
  );
  const result = [];
  let idx = 0;
  while (result.length < total && queues.some((q) => q.length > 0)) {
    const q = queues[idx % queues.length];
    if (q.length > 0) result.push(q.shift());
    idx++;
  }
  return result;
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

  // 第一层去重：按 id（同平台内重复，如分页拉到同一条）
  const seenId = new Set();
  let deduped = items.filter((it) => {
    if (seenId.has(it.id)) return false;
    seenId.add(it.id);
    return true;
  });

  // 折扣模式先排除喜+1，避免免费项在标题去重时吞掉同名付费折扣
  if (mode === "deals") {
    deduped = deduped.filter((it) => !it.isFree);
  }

  // 第二层去重：按归一化标题跨平台合并，保留优惠最大的一条
  // （同款游戏在 Steam/Epic 都上架时，id 带不同平台前缀不会命中第一层）
  const byTitle = new Map();
  for (const it of deduped) {
    const key = normalizeTitle(it.title);
    const prev = byTitle.get(key);
    if (!prev || betterDeal(it, prev)) byTitle.set(key, it);
  }
  items = [...byTitle.values()];

  if (mode === "free") {
    items = items.filter((it) => it.isFree);
  } else if (mode === "top") {
    items = pickTopByPlatformQuota(items, 10);
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
