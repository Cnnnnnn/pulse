/**
 * src/metals/metal-yahoo-fetcher.js
 *
 * Yahoo Finance v8 chart API client for international metals (XAU, XAG) + FX.
 * Uses the reverse-engineered public endpoint (no API key required).
 *
 * HTTP contract: this module expects an injected `httpGet(url, headers)` that
 * returns a `Promise<string>` of the response body. It is intentionally
 * narrower than the shared `httpClient.get(url, opts) => { status, body, error }`
 * used by the Pulse/Stock fetcher so the parsing layer never has to re-check
 * transport status or re-parse JSON. The unified dispatcher in
 * `metal-fetcher.js` (Task 5) is responsible for wrapping `httpClient` into
 * this shape — keeping the responsibility split between transport (dispatcher)
 * and parsing (this module).
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
 * @param {Object} symbolToMetal - { 'GC=F': { metalId: 'XAU', priceScale: 1/100 }, ... }.
 *   `priceScale` divides the Yahoo-reported price into the per-unit price we
 *   surface to the UI. E.g. GC=F is a futures contract quoted per 100 oz, so
 *   `priceScale: 1/100` converts 4362.8 → 43.628 USD/oz.
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

    // Yahoo occasionally returns `null` for price/time during off-hours or for
    // delisted symbols. Multiplying null by priceScale produces NaN, which
    // would propagate to the UI as a poisoned row. Skip those items entirely.
    if (!Number.isFinite(meta.regularMarketPrice) || !Number.isFinite(meta.regularMarketTime)) {
      continue;
    }

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
 *
 * The `symbolToMetal` / `symbolToFx` mappings MUST be passed in by the caller
 * (typically `metal-fetcher.js`) — this function does not know the mapping on
 * its own. Without them, the parsed response is dropped into empty buckets
 * and the caller sees an empty `quotes` object.
 *
 * Kept for ad-hoc / backwards-compatible use; new dispatchers should call
 * `parseYahooResponse` directly after fetching HTTP, so the mapping is never
 * silently lost.
 *
 * @param {string[]} symbols
 * @param {Function} httpGet - injected HTTP getter: `(url, headers) => Promise<string>`
 * @param {Object} [symbolToMetal] - see {@link parseYahooResponse}
 * @param {Object} [symbolToFx] - see {@link parseYahooResponse}
 */
async function fetchYahooQuotes(symbols, httpGet, symbolToMetal = {}, symbolToFx = {}) {
  const url = buildYahooUrl(symbols);
  const text = await httpGet(url, DEFAULT_HEADERS);
  const json = JSON.parse(text);
  return parseYahooResponse(json, symbolToMetal, symbolToFx);
}

module.exports = {
  fetchYahooQuotes,
  parseYahooResponse,
  buildYahooUrl,
};
