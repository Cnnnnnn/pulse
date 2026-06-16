/**
 * tests/main/metal-yahoo-fetcher.test.js
 *
 * Yahoo v8 chart fetcher 单测 — 用 mock httpGet, 覆盖:
 *   - parseYahooResponse: 字段映射 / priceScale / FX 解析 / 错误兜底
 *   - fetchYahooQuotes: URL 构造 / HTTP 失败 / JSON 解析失败 / 单 symbol / User-Agent
 *
 * 返回 shape 是 { quotes: { XAU: {...} }, fx: { CNY_PER_USD: {...} } }
 * 调用方 (Task 5 unified fetcher) 提供 symbolToMetal/symbolToFx mapping。
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchYahooQuotes, parseYahooResponse } from '../../src/metals/metal-yahoo-fetcher.js';

const sampleGC = {
  meta: {
    symbol: 'GC=F',
    currency: 'USD',
    regularMarketPrice: 4362.8,
    previousClose: 4351.6,
    regularMarketTime: 1781633600,
  },
};

const sampleSI = {
  meta: {
    symbol: 'SI=F',
    currency: 'USD',
    regularMarketPrice: 3522.5,
    previousClose: 3509.0,
    regularMarketTime: 1781633600,
  },
};

const sampleCNY = {
  meta: {
    symbol: 'CNY=X',
    currency: 'CNY',
    regularMarketPrice: 6.7557,
    previousClose: 6.7565,
    regularMarketTime: 1781633600,
  },
};

const sampleYahooResponse = {
  chart: { result: [sampleGC, sampleSI, sampleCNY], error: null },
};

describe('parseYahooResponse', () => {
  it('parses XAU from GC=F with priceScale 1/100 → { quotes: { XAU }, fx: {} }', () => {
    const result = parseYahooResponse(
      { chart: { result: [sampleGC], error: null } },
      { 'GC=F': { metalId: 'XAU', priceScale: 1 / 100 } }
    );
    expect(result.quotes.XAU).toMatchObject({
      id: 'XAU',
      currency: 'USD',
      unit: 'oz',
      quoteTime: 1781633600 * 1000,
      source: 'yahoo',
    });
    expect(result.quotes.XAU.price).toBeCloseTo(43.628, 3);
    expect(result.quotes.XAU.prevClose).toBeCloseTo(43.516, 3);
    expect(result.fx).toEqual({});
  });

  it('parses CNY=X into fx bucket', () => {
    const result = parseYahooResponse(
      { chart: { result: [sampleCNY], error: null } },
      {},
      { 'CNY=X': 'CNY_PER_USD' }
    );
    expect(result).toEqual({
      quotes: {},
      fx: { CNY_PER_USD: { rate: 6.7557, fetchedAt: expect.any(Number) } },
    });
  });

  it('returns both quotes and fx when both kinds of symbols present', () => {
    const result = parseYahooResponse(
      sampleYahooResponse,
      { 'GC=F': { metalId: 'XAU', priceScale: 1 / 100 }, 'SI=F': { metalId: 'XAG', priceScale: 1 / 50 } },
      { 'CNY=X': 'CNY_PER_USD' }
    );
    expect(result.quotes.XAU).toBeDefined();
    expect(result.quotes.XAG).toBeDefined();
    expect(result.fx.CNY_PER_USD).toBeDefined();
    expect(result.quotes.XAU.price).toBeCloseTo(43.628, 3);
    expect(result.quotes.XAG.price).toBeCloseTo(70.45, 3);
    expect(result.fx.CNY_PER_USD.rate).toBe(6.7557);
  });

  it('throws on null result', () => {
    expect(() => parseYahooResponse({ chart: { result: null, error: null } }, {})).toThrow(
      /Yahoo API returned no results/
    );
  });

  it('throws on error field', () => {
    expect(() =>
      parseYahooResponse({ chart: { result: [], error: { code: 'Unauthorized' } } }, {})
    ).toThrow(/Yahoo API error/);
  });

  it('skips symbols not in mappings', () => {
    const result = parseYahooResponse(
      { chart: { result: [sampleGC], error: null } },
      {} // empty mapping
    );
    expect(result.quotes).toEqual({});
    expect(result.fx).toEqual({});
  });

  it('skips items with non-finite price', () => {
    const sampleNullPrice = {
      meta: {
        symbol: 'GC=F',
        currency: 'USD',
        regularMarketPrice: null, // Yahoo occasionally returns null off-hours
        previousClose: 4351.6,
        regularMarketTime: 1781633600,
      },
    };
    const result = parseYahooResponse(
      { chart: { result: [sampleNullPrice], error: null } },
      { 'GC=F': { metalId: 'XAU', priceScale: 1 / 100 } }
    );
    expect(result.quotes).toEqual({});
    expect(result.fx).toEqual({});
  });

  it('skips items with non-finite quoteTime', () => {
    const sampleNullTime = {
      meta: {
        symbol: 'GC=F',
        currency: 'USD',
        regularMarketPrice: 4362.8,
        previousClose: 4351.6,
        regularMarketTime: null,
      },
    };
    const result = parseYahooResponse(
      { chart: { result: [sampleNullTime], error: null } },
      { 'GC=F': { metalId: 'XAU', priceScale: 1 / 100 } }
    );
    expect(result.quotes).toEqual({});
    expect(result.fx).toEqual({});
  });
});

describe('fetchYahooQuotes', () => {
  it('builds correct URL with all symbols', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(JSON.stringify(sampleYahooResponse));
    await fetchYahooQuotes(['GC=F', 'SI=F'], mockHttpGet);
    const url = mockHttpGet.mock.calls[0][0];
    expect(url).toContain('query1.finance.yahoo.com/v8/finance/chart');
    expect(url).toMatch(/symbols=GC%3DF/);
    expect(url).toMatch(/SI%3DF/);
  });

  it('passes User-Agent header', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(JSON.stringify(sampleYahooResponse));
    await fetchYahooQuotes(['GC=F'], mockHttpGet);
    const headers = mockHttpGet.mock.calls[0][1];
    expect(headers['User-Agent']).toMatch(/Mozilla/);
  });

  it('throws on HTTP failure', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(fetchYahooQuotes(['GC=F'], mockHttpGet)).rejects.toThrow('network error');
  });

  it('throws on invalid JSON', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue('not json');
    await expect(fetchYahooQuotes(['GC=F'], mockHttpGet)).rejects.toThrow();
  });

  it('forwards symbolToMetal/symbolToFx mapping to the parser', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(JSON.stringify(sampleYahooResponse));
    const result = await fetchYahooQuotes(
      ['GC=F', 'SI=F', 'CNY=X'],
      mockHttpGet,
      { 'GC=F': { metalId: 'XAU', priceScale: 1 / 100 }, 'SI=F': { metalId: 'XAG', priceScale: 1 / 50 } },
      { 'CNY=X': 'CNY_PER_USD' }
    );
    expect(result.quotes.XAU).toBeDefined();
    expect(result.quotes.XAG).toBeDefined();
    expect(result.fx.CNY_PER_USD).toBeDefined();
    expect(result.quotes.XAU.price).toBeCloseTo(43.628, 3);
  });
});
