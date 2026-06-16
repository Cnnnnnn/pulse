/**
 * src/metals/metal-config.js
 *
 * Static registry for the 4 metals tracked by Pulse.
 * Single source of truth — changing symbols or adding new metals
 * only requires editing this file.
 */

const METALS = [
  {
    id: 'XAU',
    name: '现货黄金',
    shortName: '黄金',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'yahoo-chart', symbol: 'GC=F', priceScale: 1 / 100 },
  },
  {
    id: 'XAG',
    name: '现货白银',
    shortName: '白银',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'yahoo-chart', symbol: 'SI=F', priceScale: 1 / 50 },
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

const FX_RATES = [
  { id: 'CNY_PER_USD', primary: { kind: 'yahoo-chart', symbol: 'CNY=X' } },
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