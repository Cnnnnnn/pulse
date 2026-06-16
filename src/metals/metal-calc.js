/**
 * src/metals/metal-calc.js
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
 * @param {{price: number, prevClose: number}} quote
 * @returns {{change: number, changePct: number}}
 */
function calcChange(quote) {
  if (!quote || !quote.prevClose) {
    return { change: 0, changePct: 0 };
  }
  const change = quote.price - quote.prevClose;
  const changePct = (change / quote.prevClose) * 100;
  return { change, changePct };
}

/**
 * Convert an amount in source currency to CNY.
 * @param {number} amount
 * @param {'CNY'|'USD'} fromCurrency
 * @param {number|null} cnyPerUsd  - rate (1 USD = X CNY), null when fx unavailable
 * @returns {number|null}
 */
function convertToCNY(amount, fromCurrency, cnyPerUsd) {
  if (fromCurrency === 'CNY') return amount;
  if (cnyPerUsd == null) return null;
  return amount * cnyPerUsd;
}

/**
 * Compute total holding P&L in CNY.
 * Uses the frozen per-unit costPriceCNY (recorded at buy time) — NOT live FX.
 * @param {{quantity: number, costPriceCNY: number} | null} holding
 * @param {{price: number, currency: string, unit: string}} quote
 * @param {number|null} cnyPerUsd
 * @returns {{pnlCNY: number, pnlPct: number} | null}
 */
function calcHoldingPnl(holding, quote, cnyPerUsd) {
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
 * @param {{quantity: number} | null} holding
 * @param {{change: number, changePct: number, currency: string}} quote
 * @param {number|null} cnyPerUsd
 * @returns {{todayPnlCNY: number, todayPnlPct: number} | null}
 */
function calcTodayPnl(holding, quote, cnyPerUsd) {
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
 *
 * @param {Object<string, {quantity, costPriceCNY} | null>} holdingMap
 *   Map of metal id → holding. Entries with `null`/missing holdings are skipped.
 * @param {Object<string, {price, change, changePct, currency}>} quoteMap
 *   Map of metal id → live quote. Entries with `null`/missing quotes are skipped.
 * @param {number|null} cnyPerUsd
 *   USD→CNY rate (1 USD = X CNY), or `null` when FX is unavailable.
 * @returns {{
 *   totalMarketValueCNY: number|null,
 *   totalPnlCNY: number|null,
 *   todayEstimatedCNY: number|null,
 *   hasFxMissing: boolean
 * }}
 *   Aggregated portfolio totals. `hasFxMissing` is `true` when at least one
 *   holding could not be converted to CNY (FX missing). The three CNY fields
 *   are `null` only when FX is missing AND no holding converted (`totalMV === 0`);
 *   otherwise they hold the partial sum and the caller MUST check `hasFxMissing`
 *   before displaying them as authoritative.
 *
 * @example
 *   // Happy path — FX present
 *   calcOverview({ XAU: holding }, { XAU: quote }, 6.7557);
 *   // => {
 *   //   totalMarketValueCNY: 7932.34,
 *   //   totalPnlCNY: -362.66,
 *   //   todayEstimatedCNY: 33.10,
 *   //   hasFxMissing: false
 *   // }
 *
 * @example
 *   // All-FX-missing — no holdings could convert
 *   calcOverview({ XAU: usdHolding }, { XAU: usdQuote }, null);
 *   // => {
 *   //   totalMarketValueCNY: null,
 *   //   totalPnlCNY: null,
 *   //   todayEstimatedCNY: null,
 *   //   hasFxMissing: true
 *   // }
 *
 * @example
 *   // Partial-FX-missing — CNY holding converts, USD holding drops out
 *   calcOverview(
 *     { XAU: usdHolding, AU9999: cnyHolding },
 *     { XAU: usdQuote,   AU9999: cnyQuote   },
 *     null
 *   );
 *   // => {
 *   //   totalMarketValueCNY: <AU9999 partial MV>,  // not null
 *   //   totalPnlCNY:        <AU9999 partial PnL>,
 *   //   todayEstimatedCNY:  <AU9999 partial today>,
 *   //   hasFxMissing: true                         // renderer should warn
 *   // }
 */
function calcOverview(holdingMap, quoteMap, cnyPerUsd) {
  let totalMV = 0;
  let totalCost = 0;
  let todayEst = 0;
  let hasFxMissing = false;

  for (const [id, holding] of Object.entries(holdingMap)) {
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

module.exports = {
  calcChange,
  convertToCNY,
  calcHoldingPnl,
  calcTodayPnl,
  calcOverview,
};
