import { describe, it, expect } from 'vitest';
import { METALS, FX_RATES, getMetalById } from '../../src/metals/metal-config.js';

describe('metal-config', () => {
  it('exports exactly 4 metals', () => {
    expect(METALS).toHaveLength(4);
  });

  it('all metal ids are unique', () => {
    const ids = METALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains XAU, XAG, AU9999, AG9999', () => {
    const ids = METALS.map((m) => m.id);
    expect(ids).toContain('XAU');
    expect(ids).toContain('XAG');
    expect(ids).toContain('AU9999');
    expect(ids).toContain('AG9999');
  });

  it('each metal has primary source with valid kind', () => {
    for (const m of METALS) {
      expect(m.primary).toBeTruthy();
      expect(['sina-hf', 'eastmoney']).toContain(m.primary.kind);
    }
  });

  it('international metals (XAU/XAG) use sina-hf, domestic (AU9999/AG9999) use eastmoney', () => {
    const xau = getMetalById('XAU');
    const xag = getMetalById('XAG');
    const au = getMetalById('AU9999');
    const ag = getMetalById('AG9999');
    expect(xau.primary.kind).toBe('sina-hf');
    expect(xau.primary.symbol).toBe('hf_GC');
    expect(xag.primary.kind).toBe('sina-hf');
    expect(xag.primary.symbol).toBe('hf_SI');
    expect(au.primary.kind).toBe('eastmoney');
    expect(au.primary.secid).toBe('118.AU9999');
    expect(ag.primary.kind).toBe('eastmoney');
    expect(ag.primary.secid).toBe('118.AG9999');
  });

  it('eastmoney domestic metals have correct priceDivisor (AU:100, AG:100000)', () => {
    // 关键陷阱: 黄金以 元/克 报价, f43 ÷ 100 = 939.18;
    //          白银以 元/千克 报价, f43 ÷ 100000 = 16.875.
    // priceDivisor 在 config 里显式声明, fetcher 不猜.
    const au = getMetalById('AU9999');
    const ag = getMetalById('AG9999');
    expect(au.primary.priceDivisor).toBe(100);
    expect(ag.primary.priceDivisor).toBe(100000);
  });

  it('sina-hf metals have no priceScale (hf_* quotes are already per-unit)', () => {
    for (const m of METALS) {
      if (m.primary.kind === 'sina-hf') {
        expect(m.primary.priceScale).toBeUndefined();
      }
    }
  });

  it('FX rate uses sina-hf', () => {
    expect(FX_RATES).toHaveLength(1);
    expect(FX_RATES[0].id).toBe('CNY_PER_USD');
    expect(FX_RATES[0].primary.kind).toBe('sina-hf');
    expect(FX_RATES[0].primary.symbol).toBe('USDCNY');
  });
});
