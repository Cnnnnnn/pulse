/**
 * src/metals/metal-yahoo-fetcher.js
 *
 * Yahoo Finance v8 chart API client for international metals (XAU, XAG) + FX.
 * Uses the reverse-engineered public endpoint (no API key required).
 */

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

/**
 * Build Yahoo Finance chart URL for multiple symbols.
 * @param {string[]} symbols
 */
function buildYahooUrl(symbols) {
  const params = new URLSearchParams({
    symbols: symbols.join(','),
    range: '1d',
    interval: '1m',
  });
  return `${YAHOO_BASE}?${params.toString()}`;
}

/**
 * Parse Yahoo v8 chart response into normalized quotes + FX rate.
 * @param {Object} response - raw Yahoo response
 * @param {Object} symbolToMetal - { 'GC=F': { metalId: 'XAU', priceScale: 0.01 }, ... }
 * @param {Object} [symbolToFx] - { 'CNY=X': 'CNY_PER_USD' }
 */
function parseYahooResponse(response, symbolToMetal, symbolToFx = {}) {
  const result = response?.chart?.result;
  const error = response?.chart?.error;

  if (error) {
    throw new Error(`Yahoo API error: ${error.code || 'unknown'}`);
  }
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error('Yahoo API returned no results');
  }

  const quotes = {};
  const fx = {};

  for (const item of result) {
    const meta = item?.meta;
    if (!meta || !meta.symbol) continue;
    const symbol = meta.symbol;

    if (symbolToMetal[symbol]) {
      const { metalId, priceScale = 1 } = symbolToMetal[symbol];
      quotes[metalId] = {
        id: metalId,
        price: meta.regularMarketPrice * priceScale,
        prevClose: meta.previousClose * priceScale,
        currency: meta.currency,
        unit: 'oz', // Yahoo metals always come back in oz
        quoteTime: meta.regularMarketTime * 1000,
        source: 'yahoo',
      };
    } else if (symbolToFx[symbol]) {
      const fxId = symbolToFx[symbol];
      fx[fxId] = {
        rate: meta.regularMarketPrice,
        fetchedAt: Date.now(),
      };
    }
  }

  return { quotes, fx };
}

/**
 * Fetch Yahoo quotes + FX rates for the given symbols.
 * @param {string[]} symbols
 * @param {Function} httpGet - injected HTTP getter (for testability)
 */
async function fetchYahooQuotes(symbols, httpGet) {
  const url = buildYahooUrl(symbols);
  const text = await httpGet(url, DEFAULT_HEADERS);
  const json = JSON.parse(text);
  return parseYahooResponse(json, {}, {});
}

module.exports = {
  fetchYahooQuotes,
  parseYahooResponse,
  buildYahooUrl,
};
