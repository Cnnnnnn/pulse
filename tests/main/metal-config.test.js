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
      expect(['yahoo-chart', 'sina-jsonp']).toContain(m.primary.kind);
      expect(m.primary.symbol).toBeTruthy();
    }
  });

  it('international metals (XAU/XAG) use yahoo-chart, domestic (AU9999/AG9999) use sina-jsonp', () => {
    const xau = getMetalById('XAU');
    const xag = getMetalById('XAG');
    const au = getMetalById('AU9999');
    const ag = getMetalById('AG9999');
    expect(xau.primary.kind).toBe('yahoo-chart');
    expect(xag.primary.kind).toBe('yahoo-chart');
    expect(au.primary.kind).toBe('sina-jsonp');
    expect(ag.primary.kind).toBe('sina-jsonp');
  });
});