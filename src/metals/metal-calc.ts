/**
 * src/metals/metal-calc.ts
 *
 * Pure functions for computing price change, holding P&L, and CNY portfolio overview.
 * No I/O, no state — testable in isolation.
 *
 * Convention for `holding.costPriceCNY`:
 *   It is the PER-UNIT cost in CNY, frozen at buy time
 *   (i.e. costPriceCNY = costPrice × cnyPerUsdAtBuyTime, per single unit of the metal).
 *   The total position cost is therefore `costPriceCNY × quantity`.
 *   We do NOT recompute it from the live rate — that would silently change
 *   the user's recorded basis when FX moves.
 */

/**
 * Compute price change and percentage change from a quote.
 */
export function calcChange(quote: any) {
  if (!quote || !quote.prevClose) {
    return { change: 0, changePct: 0 };
  }
  const change = quote.price - quote.prevClose;
  const changePct = (change / quote.prevClose) * 100;
  return { change, changePct };
}

/**
 * Convert an amount in source currency to CNY.
 */
export function convertToCNY(amount: any, fromCurrency: any, cnyPerUsd: any) {
  if (fromCurrency === 'CNY') return amount;
  if (cnyPerUsd == null) return null;
  return amount * cnyPerUsd;
}

/**
 * Compute total holding P&L in CNY.
 * Uses the frozen per-unit costPriceCNY (recorded at buy time) — NOT live FX.
 */
export function calcHoldingPnl(holding: any, quote: any, cnyPerUsd: any) {
  if (!holding || !quote) return null;
  const currentCNY = convertToCNY(quote.price, quote.currency, cnyPerUsd);
  if (currentCNY == null) return null;
  const currentTotalCNY = currentCNY * holding.quantity;
  // costPriceCNY is the PER-UNIT cost; multiply by quantity to get total basis.
  const costTotalCNY = holding.costPriceCNY * holding.quantity;
  const pnlCNY = currentTotalCNY - costTotalCNY;
  const pnlPct = costTotalCNY === 0 ? 0 : (pnlCNY / costTotalCNY) * 100;
  return { pnlCNY, pnlPct };
}

/**
 * Compute today's estimated P&L in CNY.
 * Uses quote.change directly (already in quote currency), converted to CNY.
 */
export function calcTodayPnl(holding: any, quote: any, cnyPerUsd: any) {
  if (!holding || !quote) return null;
  const todayCNY = convertToCNY(quote.change, quote.currency, cnyPerUsd);
  if (todayCNY == null) return null;
  return {
    todayPnlCNY: todayCNY * holding.quantity,
    todayPnlPct: quote.changePct,
  };
}

/**
 * Aggregate portfolio overview across all watched metals.
 *
 * Null-vs-partial rule:
 *   - When FX is missing AND no holding could be converted to CNY (`totalMV === 0`),
 *     all three CNY fields are `null` to signal "no trustworthy number".
 *   - When FX is missing for SOME holdings but at least one converted successfully,
 *     the CNY fields contain the partial sum and `hasFxMissing` is `true` so the
 *     renderer can display a "汇率待刷新" warning alongside the partial totals.
 */
export function calcOverview(holdingMap: any, quoteMap: any, cnyPerUsd: any) {
  let totalMV = 0;
  let totalCost = 0;
  let todayEst = 0;
  let hasFxMissing = false;

  for (const [id, raw] of Object.entries(holdingMap)) {
    const holding = raw as any;
    if (!holding) continue;
    const quote = quoteMap[id];
    if (!quote) continue;

    const mv = convertToCNY(quote.price, quote.currency, cnyPerUsd);
    if (mv == null) {
      hasFxMissing = true;
      continue;
    }
    totalMV += mv * holding.quantity;
    // costPriceCNY is the PER-UNIT cost; multiply by quantity to get total basis.
    totalCost += holding.costPriceCNY * holding.quantity;

    const today = convertToCNY(quote.change, quote.currency, cnyPerUsd);
    if (today != null) {
      todayEst += today * holding.quantity;
    }
  }

  const allFxMissing = hasFxMissing && totalMV === 0;
  return {
    totalMarketValueCNY: allFxMissing ? null : totalMV,
    totalPnlCNY: allFxMissing ? null : totalMV - totalCost,
    todayEstimatedCNY: allFxMissing ? null : todayEst,
    hasFxMissing,
  };
}

// ---- 共享常量 + 渲染辅助 (2026-07-26 code-simplifier) ------------------------
// 之前散落在 src/renderer/metals/MetalDetail.tsx + MetalWatchlist.tsx 各一份,
// 两份实现字节相同. 这里抽出避免漂移.

/** 金衡盎司 → 克的换算系数. */
export const GRAM_PER_OZ = 31.1035;

/** CNY 货币显示 (¥ + 千分位 + N 位小数, NaN/null → "—"). */
export function formatCNY(value: any, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** 通用数字显示 (千分位 + N 位小数, NaN/null → "—"). */
export function formatNum(value: any, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 国际品种 (USD/oz) → ¥/克; 国内品种 (CNY) 原价即 ¥/克. fx 缺失返 null.
 * 跟 calcChange 一样不依赖 I/O, 纯函数.
 */
export function getRefPriceCNY(quote: any, fx: any): number | null {
  if (!quote) return null;
  if (quote.currency === "CNY") return quote.price;
  if (fx == null) return null;
  return (quote.price * fx) / GRAM_PER_OZ;
}

/** 每克涨跌额 (¥/克), 国际品种经 FX 换算. */
export function getChangePerGramCNY(quote: any, fx: any): number | null {
  if (!quote) return null;
  if (quote.currency === "CNY") return calcChange(quote).change;
  if (fx == null) return null;
  return (calcChange(quote).change * fx) / GRAM_PER_OZ;
}
