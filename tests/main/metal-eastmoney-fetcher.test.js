/**
 * tests/main/metal-eastmoney-fetcher.test.js
 *
 * 东方财富 push2delay fetcher 单测 — 覆盖:
 *   - buildEastmoneyUrl: URL 拼接 + secid 编码 + fields 参数
 *   - parseEastmoneyQuote: f43 / f60 整数除以 priceDivisor
 *   - parseEastmoneyResponse: 完整 JSON 解析
 *   - fetchEastmoneyQuotes: 端到端 (mock httpGet), 失败隔离
 *
 * 关键陷阱 (实测 2026-06-17):
 *   - AU9999 (黄金, 元/克):   f43 / 100
 *   - AG9999 (白银, 元/千克): f43 / 100000
 *   priceDivisor 来自 metal-config, 永远不在这层硬编码猜.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  fetchEastmoneyQuotes,
  parseEastmoneyResponse,
  parseEastmoneyQuote,
  buildEastmoneyUrl,
} from '../../src/metals/metal-eastmoney-fetcher.js';

const au9999Response = JSON.stringify({
  rc: 0,
  data: {
    f43: 93918,
    f60: 94048,
    f86: 1781682300,
  },
});

const ag9999Response = JSON.stringify({
  rc: 0,
  data: {
    f43: 1687500,
    f60: 1669000,
    f86: 1781682300,
  },
});

describe('buildEastmoneyUrl', () => {
  it('builds push2delay URL with secid and fields', () => {
    const url = buildEastmoneyUrl('118.AU9999');
    expect(url).toBe(
      'https://push2delay.eastmoney.com/api/qt/stock/get?secid=118.AU9999&fields=f43,f44,f45,f46,f57,f58,f60,f170,f86'
    );
  });

  it('encodes special characters in secid', () => {
    const url = buildEastmoneyUrl('118.A/9999');
    // encodeURIComponent 把 / 编码为 %2F
    expect(url).toContain('secid=118.A%2F9999');
  });
});

describe('parseEastmoneyQuote', () => {
  it('AU9999: divides f43 by 100 to get 元/克', () => {
    const result = parseEastmoneyQuote(
      { f43: 93918, f60: 94048, f86: 1781682300 },
      'AU9999',
      100
    );
    expect(result).toEqual({
      id: 'AU9999',
      price: 939.18,
      prevClose: 940.48,
      currency: 'CNY',
      unit: 'g',
      quoteTime: 1781682300000,
      source: 'eastmoney',
    });
  });

  it('AG9999: divides f43 by 100000 to get 元/克 (白银报价基准是千克)', () => {
    const result = parseEastmoneyQuote(
      { f43: 1687500, f60: 1669000, f86: 1781682300 },
      'AG9999',
      100000
    );
    expect(result).toEqual({
      id: 'AG9999',
      price: 16.875,
      prevClose: 16.69,
      currency: 'CNY',
      unit: 'g',
      quoteTime: 1781682300000,
      source: 'eastmoney',
    });
  });

  it('returns null when f43 is missing', () => {
    expect(parseEastmoneyQuote({ f60: 94048 }, 'AU9999', 100)).toBe(null);
  });

  it('returns null when f60 is missing', () => {
    expect(parseEastmoneyQuote({ f43: 93918 }, 'AU9999', 100)).toBe(null);
  });

  it('returns null when f43 is non-finite', () => {
    expect(parseEastmoneyQuote({ f43: null, f60: 94048 }, 'AU9999', 100)).toBe(null);
  });

  it('returns null when price becomes 0 or negative after division', () => {
    expect(parseEastmoneyQuote({ f43: 0, f60: 94048 }, 'AU9999', 100)).toBe(null);
  });

  it('falls back to Date.now() when f86 is missing', () => {
    const before = Date.now();
    const result = parseEastmoneyQuote({ f43: 93918, f60: 94048 }, 'AU9999', 100);
    const after = Date.now();
    expect(result.quoteTime).toBeGreaterThanOrEqual(before);
    expect(result.quoteTime).toBeLessThanOrEqual(after);
  });
});

describe('parseEastmoneyResponse', () => {
  it('parses AU9999 full response', () => {
    const result = parseEastmoneyResponse(au9999Response, 'AU9999', 100);
    expect(result.price).toBeCloseTo(939.18, 4);
    expect(result.prevClose).toBeCloseTo(940.48, 4);
  });

  it('parses AG9999 full response', () => {
    const result = parseEastmoneyResponse(ag9999Response, 'AG9999', 100000);
    expect(result.price).toBeCloseTo(16.875, 4);
  });

  it('returns null for empty text', () => {
    expect(parseEastmoneyResponse('', 'AU9999', 100)).toBe(null);
  });

  it('returns null for malformed JSON', () => {
    expect(parseEastmoneyResponse('not json{', 'AU9999', 100)).toBe(null);
  });

  it('returns null when data is missing', () => {
    expect(parseEastmoneyResponse(JSON.stringify({ rc: 0 }), 'AU9999', 100)).toBe(null);
  });

  it('returns null when data.f43 is null', () => {
    const payload = JSON.stringify({ rc: 0, data: { f43: null, f60: 94048 } });
    expect(parseEastmoneyResponse(payload, 'AU9999', 100)).toBe(null);
  });
});

describe('fetchEastmoneyQuotes', () => {
  it('builds URL with secid and fetches', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(au9999Response);
    await fetchEastmoneyQuotes(
      [{ secid: '118.AU9999', metalId: 'AU9999', priceDivisor: 100 }],
      mockHttpGet
    );
    expect(mockHttpGet.mock.calls[0][0]).toContain('secid=118.AU9999');
  });

  it('parses both AU9999 and AG9999 concurrently', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('118.AU9999')) return au9999Response;
      if (url.includes('118.AG9999')) return ag9999Response;
      throw new Error('unexpected url: ' + url);
    });
    const quotes = await fetchEastmoneyQuotes(
      [
        { secid: '118.AU9999', metalId: 'AU9999', priceDivisor: 100 },
        { secid: '118.AG9999', metalId: 'AG9999', priceDivisor: 100000 },
      ],
      mockHttpGet
    );
    expect(quotes.AU9999.price).toBeCloseTo(939.18, 4);
    expect(quotes.AG9999.price).toBeCloseTo(16.875, 4);
  });

  it('isolates failures — one symbol fails, other still parsed', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('118.AU9999')) throw new Error('network error');
      if (url.includes('118.AG9999')) return ag9999Response;
      throw new Error('unexpected url: ' + url);
    });
    const quotes = await fetchEastmoneyQuotes(
      [
        { secid: '118.AU9999', metalId: 'AU9999', priceDivisor: 100 },
        { secid: '118.AG9999', metalId: 'AG9999', priceDivisor: 100000 },
      ],
      mockHttpGet
    );
    expect(quotes.AU9999).toBeUndefined();
    expect(quotes.AG9999).toBeDefined();
    expect(quotes.AG9999.price).toBeCloseTo(16.875, 4);
  });

  it('throws aggregate error when ALL symbols fail (lets dispatcher register eastmoney failure)', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(
      fetchEastmoneyQuotes(
        [
          { secid: '118.AU9999', metalId: 'AU9999', priceDivisor: 100 },
          { secid: '118.AG9999', metalId: 'AG9999', priceDivisor: 100000 },
        ],
        mockHttpGet
      )
    ).rejects.toThrow(/eastmoney: all 2 symbol\(s\) failed/);
  });

  it('returns empty object for empty input', async () => {
    const mockHttpGet = vi.fn();
    const quotes = await fetchEastmoneyQuotes([], mockHttpGet);
    expect(quotes).toEqual({});
    expect(mockHttpGet).not.toHaveBeenCalled();
  });
});
