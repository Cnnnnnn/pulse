/**
 * src/metals/metal-fetcher.js
 *
 * Unified dispatcher that runs Yahoo and Sina fetchers concurrently.
 * Failures are isolated per fetcher — one down doesn't block the other.
 *
 * HTTP abstraction: this module takes an injected `httpGet(url, headers) => Promise<string|Buffer>`
 * so the same module is testable in isolation. The main-process caller
 * (metal-scheduler.js) is responsible for adapting Pulse's `httpClient` into this shape:
 *
 *   const wrappedGet = (url, headers) =>
 *     httpClient.get(url, { headers, timeoutMs: 8000 })
 *       .then(r => {
 *         if (r.error) throw new Error(r.error);
 *         if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
 *         return r.body;  // string or Buffer depending on content-type
 *       });
 *
 * Dispatcher signature note: the original plan proposed a DI-container shape of
 * `fetchAllQuotes({ yahooFetcher, sinaFetcher, httpGet })` so each fetcher could
 * be swapped independently in tests. We deliberately use the simpler
 * `fetchAllQuotes(httpGet)` signature instead. Only two fetchers exist (Yahoo
 * and Sina), there is no realistic scenario where they would need to be
 * replaced independently — a fake HTTP layer covers all failure-mode and
 * response-shape variations the dispatcher cares about. The per-fetcher
 * parsing modules already accept their own dependencies (see
 * `fetchYahooQuotes` / `fetchSinaQuotes`), so any test that needs to control
 * parsing behaviour can inject there. Keeping the dispatcher surface narrow
 * avoids a needless indirection layer.
 */

const { METALS, FX_RATES } = require('./metal-config.js');
const { fetchYahooQuotes } = require('./metal-yahoo-fetcher.js');
const { fetchSinaQuotes } = require('./metal-sina-fetcher.js');

/**
 * Build the fetch plan: which symbols go to which fetcher.
 * Yahoo: XAU, XAG, CNY=X. Sina: AU9999, AG9999.
 * @returns {Array<{kind: string, symbols: string[]}>}
 */
function buildFetcherPlan() {
  const yahooSymbols = [];
  const sinaSymbols = [];

  for (const metal of METALS) {
    if (metal.primary.kind === 'yahoo-chart') {
      yahooSymbols.push(metal.primary.symbol);
    } else if (metal.primary.kind === 'sina-jsonp') {
      sinaSymbols.push(metal.primary.symbol);
    }
  }

  for (const fx of FX_RATES) {
    if (fx.primary.kind === 'yahoo-chart') {
      yahooSymbols.push(fx.primary.symbol);
    }
  }

  const plan = [];
  if (yahooSymbols.length > 0) plan.push({ kind: 'yahoo-chart', symbols: yahooSymbols });
  if (sinaSymbols.length > 0) plan.push({ kind: 'sina-jsonp', symbols: sinaSymbols });
  return plan;
}

/**
 * Fetch all metal quotes + FX rates with failure isolation.
 *
 * @param {Function} httpGet - injected HTTP getter: (url, headers) => Promise<string|Buffer>
 * @returns {Promise<{quotes: Object, fx: Object, errors: Object}>}
 */
async function fetchAllQuotes(httpGet) {
  const plan = buildFetcherPlan();
  const errors = {};

  // Build symbol → metal mapping for Yahoo
  const yahooSymbolToMetal = {};
  for (const metal of METALS) {
    if (metal.primary.kind === 'yahoo-chart') {
      yahooSymbolToMetal[metal.primary.symbol] = {
        metalId: metal.id,
        priceScale: metal.primary.priceScale || 1,
      };
    }
  }

  // Build symbol → fx mapping for Yahoo
  const yahooSymbolToFx = {};
  for (const fx of FX_RATES) {
    if (fx.primary.kind === 'yahoo-chart') {
      yahooSymbolToFx[fx.primary.symbol] = fx.id;
    }
  }

  const yahooBatch = plan.find((p) => p.kind === 'yahoo-chart');
  const sinaBatch = plan.find((p) => p.kind === 'sina-jsonp');

  // Run both concurrently with isolation
  const [yahooResult, sinaResult] = await Promise.allSettled([
    yahooBatch
      ? fetchYahooQuotes(yahooBatch.symbols, httpGet, yahooSymbolToMetal, yahooSymbolToFx)
      : Promise.resolve({ quotes: {}, fx: {} }),
    sinaBatch
      ? fetchSinaQuotes(sinaBatch.symbols, httpGet)
      : Promise.resolve({}),
  ]);

  const quotes = {};
  const fx = {};

  if (yahooResult.status === 'fulfilled') {
    Object.assign(quotes, yahooResult.value.quotes);
    Object.assign(fx, yahooResult.value.fx);
  } else {
    errors.yahoo = yahooResult.reason;
  }

  if (sinaResult.status === 'fulfilled') {
    Object.assign(quotes, sinaResult.value);
  } else {
    errors.sina = sinaResult.reason;
  }

  return { quotes, fx, errors };
}

module.exports = {
  fetchAllQuotes,
  buildFetcherPlan,
};
