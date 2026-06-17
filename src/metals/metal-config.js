/**
 * src/metals/metal-config.js
 *
 * Static registry for the 4 metals tracked by Pulse.
 * Single source of truth — changing symbols or adding new metals
 * only requires editing this file.
 */

// Data source note (v2.20.0 → v2.21.0):
//   国际金/银/汇率: 新浪 hf_GC/hf_SI/USDCNY (Yahoo v8 chart 已挂, 详见 metal-sina-hf-fetcher.js)
//   国内金/银: 东方财富 118.AU9999/118.AG9999 (新浪 AU0/AG0 已停更, 返回 2024 陈旧数据).
//     东方财富 f43 是整数, 不同品种除数不同 (见 metal-eastmoney-fetcher.js):
//       AU9999 (黄金, 元/克报价): priceDivisor = 100
//       AG9999 (白银, 元/千克报价): priceDivisor = 100000
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
    primary: { kind: 'eastmoney', secid: '118.AU9999', priceDivisor: 100 },
  },
  {
    id: 'AG9999',
    name: '国内白银 AG9999',
    shortName: 'AG9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'eastmoney', secid: '118.AG9999', priceDivisor: 100000 },
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