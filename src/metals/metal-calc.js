/**
 * src/metals/metal-calc.js
 *
 * Pure functions for computing price change, holding P&L, and CNY portfolio overview.
 * No I/O, no state — testable in isolation.
 *
 * Convention for `holding.costPriceCNY`:
 *   It is the FROZEN TOTAL cost of the position in CNY (recorded at buy time,
 *   i.e. costPriceCNY = costPrice × cnyPerUsdAtBuyTime × quantity).
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
 * Uses the frozen costPriceCNY (recorded at buy time) — NOT live FX.
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
  // costPriceCNY is the FROZEN total position cost (already includes quantity)
  const costTotalCNY = holding.costPriceCNY;
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
 * @param {Object<string, {quantity, costPriceCNY} | null>} holdingMap
 * @param {Object<string, {price, change, changePct, currency}>} quoteMap
 * @param {number|null} cnyPerUsd
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
    // costPriceCNY is the FROZEN total position cost (already includes quantity)
    totalCost += holding.costPriceCNY;

    const today = convertToCNY(quote.change, quote.currency, cnyPerUsd);
    if (today != null) {
      todayEst += today * holding.quantity;
    }
  }

  return {
    totalMarketValueCNY: hasFxMissing && totalMV === 0 ? null : totalMV,
    totalPnlCNY: hasFxMissing && totalMV === 0 ? null : totalMV - totalCost,
    todayEstimatedCNY: hasFxMissing && totalMV === 0 ? null : todayEst,
  };
}

module.exports = {
  calcChange,
  convertToCNY,
  calcHoldingPnl,
  calcTodayPnl,
  calcOverview,
};
