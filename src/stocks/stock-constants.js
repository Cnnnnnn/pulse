/**
 * src/stocks/stock-constants.js
 *
 * A 股筛选器常量: 东财 clist 接口参数 / 字段映射 / 市值分档阈值.
 *
 * 对照 spec §5.2. 这些常量被 stock-fetcher (API 调用) / stock-filter (过滤) /
 * strategies (预设策略) / renderer (条件区) 共用.
 *
 * ponytail: 纯常量模块, 不依赖 node 内置 (会被 renderer 端 bundle).
 *          需要 node 能力的函数 (computeMarketOverview 等) 拆到 market-overview.js.
 */

// 东财 clist 接口的 fs 参数: 沪深全部 A 股
//   m:1+t:2  沪主板 / m:1+t:23 沪中小板
//   m:0+t:6  深主板 / m:0+t:80 创业板
const MARKET_PARAM = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";

// 东财 clist 字段 → 我们的 key. 见 spec §5.2 映射表.
// ponytail 2026-07-08 D-1: 加 revenueGrowthYoY (f41, 营业收入同比%) + netIncomeGrowthYoY (f46, 净利润同比%).
// ponytail 2026-07-18 P0-0: 修正 f57→f41 / f58→f46 (见 FIELD_MAP 上方注释).
//   东财 clist 标准字段, 跟现有 PE/ROE 同套接口 1 次拉, 零额外请求. 量比/MA20 偏离不做 (后者需新接口, YAGNI).
// ponytail 2026-07-18 P0-0 修复: 之前 f57/f58 错位 (f57=资产负债比率, f58=股东权益,
// 跟营收/净利同比无关). 正确字段: f41=营业收入同比(%), f46=净利润同比(%). web search
// 验证 3 个独立来源. 修后所有依赖营收/净利同比的下游代码 (筛选 / 排序 / AI 摘要 / 预设策略)
// 立刻拿到真实数据, 零 API 兼容性问题 (数值范围恰好同是 0-100% 区间).
const FIELD_MAP = {
  code: "f12",
  name: "f14",
  price: "f2",
  changePct: "f3",
  turnover: "f8", // 换手率 %
  pe: "f9", // PE 动态
  pb: "f23",
  roe: "f173", // ROE (净资产收益率 %) — 注: f21 是流通市值, 非 ROE
  industry: "f100",
  marketCap: "f20", // 总市值 (元)
  revenueGrowthYoY: "f41", // 营业收入同比 % (P0-0 修复: 之前 f57 错位)
  netIncomeGrowthYoY: "f46", // 净利润同比 % (P0-0 修复: 之前 f58 错位)
};

// 请求 fields 参数 (逗号拼接所有东财字段)
const FIELDS_PARAM = Object.values(FIELD_MAP).join(",");

// 东财 clist 强制单页 ≤100 条 (pz 再大也只返 100).
// 策略: 把"排序意图"下推给东财 (fid=排序字段), 翻页拉该维度全量, 前端再二次过滤.
// sortKey (我们的 key) → 东财 fid (排序字段).
// ponytail 2026-07-08 D-1: 加营收/净利同比给 P-1 命中率高的排序维度.
// ponytail 2026-07-18 P0-0: 同步 f57/f58 → f41/f46.
// ponytail 2026-07-18 P0-0: 同步 f57→f41 / f58→f46.
const SORT_KEY_TO_FID = {
  roe: "f173",
  pe: "f9",
  pb: "f23",
  changePct: "f3",
  marketCap: "f20",
  turnover: "f8",
  price: "f2",
  revenueGrowthYoY: "f41",
  netIncomeGrowthYoY: "f46",
};

/** 默认排序字段 (东财 fid), 当 sortKey 未知时用. */
const DEFAULT_FID = "f173"; // 按 ROE 降序

const MARKET_CAP_TIERS = ["all", "large", "mid", "small"];

// 市值阈值 (元). large>500亿, mid 100-500亿, small<100亿.
const MARKET_CAP_LARGE = 5e11; // 500亿
const MARKET_CAP_MID = 1e11; // 100亿

/**
 * 按总市值(元)分档. null/非数 → null (无法分档).
 * @param {number|null|undefined} marketCapYuan
 * @returns {"large"|"mid"|"small"|null}
 */
function tierForMarketCap(marketCapYuan) {
  if (typeof marketCapYuan !== "number" || !Number.isFinite(marketCapYuan)) {
    return null;
  }
  if (marketCapYuan >= MARKET_CAP_LARGE) return "large";
  if (marketCapYuan >= MARKET_CAP_MID) return "mid";
  return "small";
}

// 默认筛选条件: 所有数值过滤项 null = 不限.
// ponytail 2026-07-08 D-1: 加营收 / 净利同比增速下限. 跟现有 roeMin 同型, 是 MIN_FILTER 候选.
const DEFAULT_SCREENER_CRITERIA = {
  peMin: null,
  peMax: null,
  pbMin: null,
  pbMax: null,
  roeMin: null,
  dividendYieldMin: null,
  turnoverMin: null,
  turnoverMax: null,
  change5dMin: null,
  revenueGrowthYoYMin: null,
  netIncomeGrowthYoYMin: null,
  marketCapTier: "all",
  industries: [],
};

module.exports = {
  MARKET_PARAM,
  FIELD_MAP,
  FIELDS_PARAM,
  SORT_KEY_TO_FID,
  DEFAULT_FID,
  MARKET_CAP_TIERS,
  MARKET_CAP_LARGE,
  MARKET_CAP_MID,
  tierForMarketCap,
  DEFAULT_SCREENER_CRITERIA,
};
