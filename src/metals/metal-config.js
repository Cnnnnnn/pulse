/**
 * src/metals/metal-config.js
 *
 * Static registry for the 4 metals tracked by Pulse.
 * Single source of truth — changing symbols or adding new metals
 * only requires editing this file.
 */

// Data source note (v2.20.0):
//   Yahoo Finance v8 chart API is dead (returns sad-panda HTML). We replaced
//   it with Sina `hf_*` international spot quotes, which are already denominated
//   in USD/oz — so NO priceScale conversion is needed (unlike the old Yahoo
//   futures-contract path that divided GC=F by 100 / SI=F by 50).
//   Field layout verified 2026-06-17 — see metal-sina-hf-fetcher.js.
const METALS = [
  {
    id: 'XAU',
    name: '现货黄金',
    shortName: '黄金',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'sina-hf', symbol: 'hf_GC' },
  },
  {
    id: 'XAG',
    name: '现货白银',
    shortName: '白银',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'sina-hf', symbol: 'hf_SI' },
  },
  {
    id: 'AU9999',
    name: '国内黄金 AU9999',
    shortName: 'AU9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'sina-jsonp', symbol: 'AU0' },
  },
  {
    id: 'AG9999',
    name: '国内白银 AG9999',
    shortName: 'AG9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'sina-jsonp', symbol: 'AG0' },
  },
];

// USDCNY Sina row layout: [0]=time [1]=bid [3]=ask [5]=mid. We surface mid as rate.
const FX_RATES = [
  { id: 'CNY_PER_USD', primary: { kind: 'sina-hf', symbol: 'USDCNY' } },
];

/**
 * Derived list of metal ids. Used as the default `watchedIds` value
 * in the renderer's metalStore (Task 7).
 */
const METAL_IDS = METALS.map((m) => m.id);

function getMetalById(id) {
  return METALS.find((m) => m.id === id) || null;
}

module.exports = { METALS, FX_RATES, METAL_IDS, getMetalById };