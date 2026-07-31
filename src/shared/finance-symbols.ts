/**
 * 财经行情符号 — 单一事实来源（main 主进程 + renderer 渲染进程共用）。
 *
 * INDEX_SYMBOLS 同时驱动：① 主进程新浪行情拉取顺序；② 渲染行情条展示顺序。
 * FX_SYMBOLS 驱动汇率拉取。short 为行情条紧凑展示名，缺省回退 name。
 *
 * 此前 INDEX_SYMBOLS/FX_SYMBOLS 在 main/finance/fetcher-market-quote.ts 与
 * renderer/finance/quoteSymbols.ts 各定义一份，改一处易漏另一处 → 收敛到此文件。
 */

export interface MarketSymbol {
  symbol: string;
  name: string;
  /** 行情条紧凑展示名（如「上证」）；缺省回退 name。 */
  short?: string;
}

export const INDEX_SYMBOLS: MarketSymbol[] = [
  { symbol: "s_sh000001", name: "上证指数", short: "上证" },
  { symbol: "s_sz399001", name: "深证成指", short: "深证" },
  { symbol: "s_sz399006", name: "创业板指", short: "创业板" },
  { symbol: "s_sh000300", name: "沪深300", short: "沪深300" },
  { symbol: "s_sh000688", name: "科创50", short: "科创50" },
];

export const FX_SYMBOLS: MarketSymbol[] = [
  { symbol: "USDCNY", name: "美元/人民币" },
];

/** 行情条展示名：优先 short，回退 name。 */
export function shortName(sym: MarketSymbol): string {
  return sym.short || sym.name;
}
