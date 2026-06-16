/**
 * tests/main/metal-fetcher.test.js
 *
 * Unified dispatcher 单测 — 覆盖:
 *   - buildFetcherPlan: 2 个 batch (yahoo + sina),symbol 正确分组
 *   - fetchAllQuotes: 合并 quotes / fx / errors
 *   - Failure isolation: yahoo fail 不阻塞 sina,反之亦然
 *   - 并发执行(yahoo + sina 同时启动)
 *   - 两个都失败时 errors 都填充
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchAllQuotes, buildFetcherPlan } from '../../src/metals/metal-fetcher.js';

// Realistic mock responses
const yahooResponseBody = JSON.stringify({
  chart: {
    result: [
      {
        meta: {
          symbol: 'GC=F',
          currency: 'USD',
          regularMarketPrice: 4362.8,
          previousClose: 4351.6,
          regularMarketTime: 1781633600,
        },
      },
      {
        meta: {
          symbol: 'SI=F',
          currency: 'USD',
          regularMarketPrice: 3522.5,
          previousClose: 3509.0,
          regularMarketTime: 1781633600,
        },
      },
      {
        meta: {
          symbol: 'CNY=X',
          currency: 'CNY',
          regularMarketPrice: 6.7557,
          previousClose: 6.7565,
          regularMarketTime: 1781633600,
        },
      },
    ],
    error: null,
  },
});

const sinaResponseBody =
  'var hq_str_AU0="黄金现货,145957,574.86,585.84,574.40,2024-07-17";\n' +
  'var hq_str_AG0="白银现货,145959,8100.00,8283.00,8100.00,2024-07-17";\n';

describe('buildFetcherPlan', () => {
  it('returns 2 batches (yahoo-chart + sina-jsonp)', () => {
    const plan = buildFetcherPlan();
    expect(plan).toHaveLength(2);
    expect(plan.find((p) => p.kind === 'yahoo-chart')).toBeDefined();
    expect(plan.find((p) => p.kind === 'sina-jsonp')).toBeDefined();
  });

  it('Yahoo batch contains GC=F, SI=F, CNY=X', () => {
    const yahoo = buildFetcherPlan().find((p) => p.kind === 'yahoo-chart');
    expect(yahoo.symbols).toContain('GC=F');
    expect(yahoo.symbols).toContain('SI=F');
    expect(yahoo.symbols).toContain('CNY=X');
  });

  it('Sina batch contains AU0, AG0', () => {
    const sina = buildFetcherPlan().find((p) => p.kind === 'sina-jsonp');
    expect(sina.symbols).toContain('AU0');
    expect(sina.symbols).toContain('AG0');
  });
});

describe('fetchAllQuotes', () => {
  it('merges Yahoo + Sina results', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('yahoo')) return yahooResponseBody;
      if (url.includes('sina')) return sinaResponseBody;
      throw new Error('unexpected url: ' + url);
    });

    const result = await fetchAllQuotes(mockHttpGet);

    // Yahoo metals (with priceScale applied)
    expect(result.quotes.XAU).toBeDefined();
    expect(result.quotes.XAU.price).toBeCloseTo(43.628, 3);
    expect(result.quotes.XAU.unit).toBe('oz');
    expect(result.quotes.XAU.currency).toBe('USD');

    expect(result.quotes.XAG).toBeDefined();
    expect(result.quotes.XAG.price).toBeCloseTo(70.45, 3);

    // FX
    expect(result.fx.CNY_PER_USD).toBeDefined();
    expect(result.fx.CNY_PER_USD.rate).toBe(6.7557);

    // Sina metals
    expect(result.quotes.AU9999).toBeDefined();
    expect(result.quotes.AU9999.price).toBe(574.86);
    expect(result.quotes.AU9999.unit).toBe('g');
    expect(result.quotes.AU9999.currency).toBe('CNY');

    expect(result.quotes.AG9999).toBeDefined();
    expect(result.quotes.AG9999.price).toBe(8100.0);

    // No errors
    expect(result.errors).toEqual({});
  });

  it('isolates failures — Yahoo down, Sina succeeds', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('yahoo')) throw new Error('yahoo down');
      if (url.includes('sina')) return sinaResponseBody;
      throw new Error('unexpected url: ' + url);
    });

    const result = await fetchAllQuotes(mockHttpGet);

    expect(result.quotes.AU9999).toBeDefined();
    expect(result.quotes.AG9999).toBeDefined();
    expect(result.errors.yahoo).toBeDefined();
    expect(result.errors.yahoo.message).toBe('yahoo down');
    expect(result.errors.sina).toBeUndefined();
  });

  it('isolates failures — Sina down, Yahoo succeeds', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('yahoo')) return yahooResponseBody;
      if (url.includes('sina')) throw new Error('sina down');
      throw new Error('unexpected url: ' + url);
    });

    const result = await fetchAllQuotes(mockHttpGet);

    expect(result.quotes.XAU).toBeDefined();
    expect(result.fx.CNY_PER_USD).toBeDefined();
    expect(result.errors.sina).toBeDefined();
    expect(result.errors.sina.message).toBe('sina down');
    expect(result.errors.yahoo).toBeUndefined();
  });

  it('both fail — errors populated, quotes empty', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchAllQuotes(mockHttpGet);
    expect(result.errors.yahoo).toBeDefined();
    expect(result.errors.sina).toBeDefined();
    expect(Object.keys(result.quotes)).toHaveLength(0);
    expect(Object.keys(result.fx)).toHaveLength(0);
  });

  it('runs Yahoo and Sina concurrently', async () => {
    const startTimes = { yahoo: 0, sina: 0 };
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      const which = url.includes('yahoo') ? 'yahoo' : 'sina';
      startTimes[which] = Date.now();
      await new Promise((r) => setTimeout(r, 30));
      return url.includes('yahoo') ? yahooResponseBody : sinaResponseBody;
    });

    await fetchAllQuotes(mockHttpGet);

    // Both should have started within 5ms of each other (concurrent, not serial)
    expect(Math.abs(startTimes.yahoo - startTimes.sina)).toBeLessThan(5);
  });
});
