/**
 * src/metals/metal-fetcher.ts
 *
 * Unified dispatcher that runs three fetchers concurrently with failure isolation:
 *   - sina-hf:     国际金/银 (hf_GC, hf_SI) + 汇率 (USDCNY), 1 次 HTTP
 *   - eastmoney:   国内金/银 (AU9999, AG9999), 每品种 1 次 HTTP 并发
 *
 * 任一 fetcher 挂掉不影响其他. 历史变迁见 metal-sina-hf-fetcher.ts /
 * metal-eastmoney-fetcher.ts 头部注释.
 *
 * HTTP abstraction: 注入 httpGet(url, headers) => Promise<string>.
 */

import { METALS, FX_RATES } from './metal-config';
import { fetchHfQuotes } from './metal-sina-hf-fetcher';
import { fetchEastmoneyQuotes } from './metal-eastmoney-fetcher';

/**
 * Build the fetch plan: which symbols go to which fetcher.
 */
export function buildFetcherPlan() {
  const hfSymbols: any[] = [];
  const eastmoneyItems: any[] = [];

  for (const metal of METALS) {
    if (metal.primary.kind === 'sina-hf') {
      hfSymbols.push(metal.primary.symbol);
    } else if (metal.primary.kind === 'eastmoney') {
      eastmoneyItems.push(metal.primary.secid);
    }
  }

  for (const fx of FX_RATES) {
    if (fx.primary.kind === 'sina-hf') {
      hfSymbols.push(fx.primary.symbol);
    }
  }

  const plan: any[] = [];
  if (hfSymbols.length > 0) plan.push({ kind: 'sina-hf', symbols: hfSymbols });
  if (eastmoneyItems.length > 0) plan.push({ kind: 'eastmoney', secids: eastmoneyItems });
  return plan;
}

/**
 * Fetch all metal quotes + FX rates with failure isolation.
 */
export async function fetchAllQuotes(httpGet: any) {
  const plan = buildFetcherPlan();
  const errors: any = {};

  // === sina-hf 映射 (国际金属 + 汇率) ===
  const hfSymbolToMetal: any = {};
  for (const metal of METALS) {
    if (metal.primary.kind === 'sina-hf') {
      hfSymbolToMetal[metal.primary.symbol] = {
        metalId: metal.id,
        meta: { unit: metal.unit, currency: metal.currency },
      };
    }
  }
  const hfSymbolToFx: any = {};
  for (const fx of FX_RATES) {
    if (fx.primary.kind === 'sina-hf') {
      hfSymbolToFx[fx.primary.symbol] = fx.id;
    }
  }

  // === eastmoney 映射 (国内现货) ===
  const eastmoneyItems: any[] = [];
  for (const metal of METALS) {
    if (metal.primary.kind === 'eastmoney') {
      eastmoneyItems.push({
        secid: metal.primary.secid,
        metalId: metal.id,
        priceDivisor: metal.primary.priceDivisor,
      });
    }
  }

  const hfBatch = plan.find((p) => p.kind === 'sina-hf');
  const emBatch = plan.find((p) => p.kind === 'eastmoney');

  // 三个 fetcher 并发 (sina-hf, eastmoney; sina-jsonp 已废弃)
  const [hfResult, emResult] = await Promise.allSettled([
    hfBatch
      ? fetchHfQuotes(hfBatch.symbols, httpGet, hfSymbolToMetal, hfSymbolToFx)
      : Promise.resolve({ quotes: {}, fx: {} }),
    emBatch
      ? fetchEastmoneyQuotes(eastmoneyItems, httpGet)
      : Promise.resolve({}),
  ]);

  const quotes: any = {};
  const fx: any = {};

  if (hfResult.status === 'fulfilled') {
    Object.assign(quotes, hfResult.value.quotes);
    Object.assign(fx, hfResult.value.fx);
  } else {
    errors['sina-hf'] = hfResult.reason;
  }

  if (emResult.status === 'fulfilled') {
    Object.assign(quotes, emResult.value);
  } else {
    errors['eastmoney'] = emResult.reason;
  }

  return { quotes, fx, errors };
}

module.exports = {
  fetchAllQuotes,
  buildFetcherPlan,
};
