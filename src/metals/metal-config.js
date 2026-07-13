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
// 2026-07-13 投资 nav 合并: 金属本身没有股票 ticker, 通过 compareCode 映射到可交易场内 ETF/LOF,
//   才能入对比池 (comparePool 以 code 为唯一键). 默认值待产品/数据同学拍板.
//   同 compareCode 去重约定: XAU 和 AU9999 都映射到 518880 (华安黄金ETF, 同一标的),
//   加第二个会被 toggle 移除而非新增 —— 这是预期行为, UX 上 AddToCompareButton 用 isInCompare 判断.
const METALS = [
  {
    id: 'XAU',
    name: '现货黄金',
    shortName: '黄金',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'sina-hf', symbol: 'hf_GC' },
    historySecid: '113.AU2608',
    proxyLabel: '沪金2608代理',
    unitDivisor: 1,
    compareCode: '518880',
    compareName: '华安黄金ETF',
  },
  {
    id: 'XAG',
    name: '现货白银',
    shortName: '白银',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'sina-hf', symbol: 'hf_SI' },
    historySecid: '113.AG2608',
    proxyLabel: '沪银2608代理',
    unitDivisor: 1000,
    compareCode: '161226',
    compareName: '国投白银LOF',
  },
  {
    id: 'AU9999',
    name: '国内黄金 AU9999',
    shortName: 'AU9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'eastmoney', secid: '118.AU9999', priceDivisor: 100 },
    historySecid: '118.AU9999',
    proxyLabel: null,
    unitDivisor: 1,
    compareCode: '518880',
    compareName: '华安黄金ETF',
  },
  {
    id: 'AG9999',
    name: '国内白银 AG9999',
    shortName: 'AG9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'eastmoney', secid: '118.AG9999', priceDivisor: 100000 },
    historySecid: '118.AG9999',
    proxyLabel: null,
    unitDivisor: 1000,
    compareCode: '161226',
    compareName: '国投白银LOF',
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