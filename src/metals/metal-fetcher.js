/**
 * src/metals/metal-fetcher.js
 *
 * Unified dispatcher that runs the Sina hf fetcher (international metals + FX)
 * and the Sina jsonp fetcher (domestic metals) concurrently. Failures are
 * isolated per fetcher — one down doesn't block the other.
 *
 * HTTP abstraction: this module takes an injected `httpGet(url, headers) => Promise<string>`
 * so the same module is testable in isolation. The main-process caller
 * (metal-scheduler.js) is responsible for adapting Pulse's `httpClient` into this shape:
 *
 *   const wrappedGet = (url, headers) =>
 *     httpClient.get(url, { headers, timeoutMs: 8000 })
 *       .then(r => {
 *         if (r.error) throw new Error(r.error);
 *         if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
 *         return r.body;  // always a UTF-8 string
 *       });
 *
 * History: the original design (v2.20 plan) used a Yahoo v8 chart fetcher for
 * international metals + FX. Yahoo's endpoint died mid-2026, so we replaced it
 * with the Sina hf_* symbols (already USD/oz, no priceScale needed). The
 * domestic path (sina-jsonp, AU0/AG0) is unchanged. The dispatcher surface
 * stays the same — only the fetcher module swapped.
 */

const { METALS, FX_RATES } = require('./metal-config.js');
const { fetchHfQuotes } = require('./metal-sina-hf-fetcher.js');
const { fetchSinaQuotes } = require('./metal-sina-fetcher.js');

/**
 * Build the fetch plan: which symbols go to which fetcher.
 *   sina-hf:    XAU (hf_GC), XAG (hf_SI), CNY_PER_USD (USDCNY)
 *   sina-jsonp: AU9999 (AU0), AG9999 (AG0)
 * @returns {Array<{kind: string, symbols: string[]}>}
 */
function buildFetcherPlan() {
  const hfSymbols = [];
  const sinaSymbols = [];

  for (const metal of METALS) {
    if (metal.primary.kind === 'sina-hf') {
      hfSymbols.push(metal.primary.symbol);
    } else if (metal.primary.kind === 'sina-jsonp') {
      sinaSymbols.push(metal.primary.symbol);
    }
  }

  for (const fx of FX_RATES) {
    if (fx.primary.kind === 'sina-hf') {
      hfSymbols.push(fx.primary.symbol);
    }
  }

  const plan = [];
  if (hfSymbols.length > 0) plan.push({ kind: 'sina-hf', symbols: hfSymbols });
  if (sinaSymbols.length > 0) plan.push({ kind: 'sina-jsonp', symbols: sinaSymbols });
  return plan;
}

/**
 * Fetch all metal quotes + FX rates with failure isolation.
 *
 * @param {Function} httpGet - injected HTTP getter: (url, headers) => Promise<string>
 * @returns {Promise<{quotes: Object, fx: Object, errors: Object}>}
 */
async function fetchAllQuotes(httpGet) {
  const plan = buildFetcherPlan();
  const errors = {};

  // Build symbol → metal mapping for hf fetcher (international metals)
  const hfSymbolToMetal = {};
  for (const metal of METALS) {
    if (metal.primary.kind === 'sina-hf') {
      hfSymbolToMetal[metal.primary.symbol] = {
        metalId: metal.id,
        meta: { unit: metal.unit, currency: metal.currency },
      };
    }
  }

  // Build symbol → fx mapping for hf fetcher (USDCNY)
  const hfSymbolToFx = {};
  for (const fx of FX_RATES) {
    if (fx.primary.kind === 'sina-hf') {
      hfSymbolToFx[fx.primary.symbol] = fx.id;
    }
  }

  const hfBatch = plan.find((p) => p.kind === 'sina-hf');
  const sinaBatch = plan.find((p) => p.kind === 'sina-jsonp');

  // Run both concurrently with isolation
  const [hfResult, sinaResult] = await Promise.allSettled([
    hfBatch
      ? fetchHfQuotes(hfBatch.symbols, httpGet, hfSymbolToMetal, hfSymbolToFx)
      : Promise.resolve({ quotes: {}, fx: {} }),
    sinaBatch
      ? fetchSinaQuotes(sinaBatch.symbols, httpGet)
      : Promise.resolve({}),
  ]);

  const quotes = {};
  const fx = {};

  if (hfResult.status === 'fulfilled') {
    Object.assign(quotes, hfResult.value.quotes);
    Object.assign(fx, hfResult.value.fx);
  } else {
    errors['sina-hf'] = hfResult.reason;
  }

  if (sinaResult.status === 'fulfilled') {
    Object.assign(quotes, sinaResult.value);
  } else {
    errors['sina-jsonp'] = sinaResult.reason;
  }

  return { quotes, fx, errors };
}

module.exports = {
  fetchAllQuotes,
  buildFetcherPlan,
};
