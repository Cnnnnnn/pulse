/**
 * tests/main/metal-sina-fetcher.test.js
 *
 * Sina JSONP fetcher 单测 — 覆盖:
 *   - parseSinaLine: 单行解析 / 字段映射 / 容错
 *   - parseSinaResponse: 多行解析 / symbol→metal mapping
 *   - parseSinaTime: HHMMSS + YYYY-MM-DD → unix ms
 *   - fetchSinaQuotes: URL 构造 / HTTP 失败 / 错误响应类型
 *
 * 注: 不再测 GBK Buffer 解码 — Pulse http-client 永远输出 UTF-8 string,
 * sina 接口的 number / ASCII 字段在 GBK / UTF-8 下字节级兼容,
 * 不需要 iconv-lite. v2.20.0 起已删除该分支.
 *
 * Sina field positions (verified):
 *   [0] name, [1] time HHMMSS, [2] current, [3] prevClose, [4] open, ...
 *   [16] date YYYY-MM-DD
 */

import { describe, it, expect, vi } from 'vitest';
import {
  fetchSinaQuotes,
  parseSinaResponse,
  parseSinaLine,
  parseSinaTime,
  buildSinaUrl,
} from '../../src/metals/metal-sina-fetcher.js';

const sampleAU0Line =
  'var hq_str_AU0="黄金现货,145957,574.86,585.84,574.40,574.94,581.58,581.60,581.56,0.00,572.76,1,1,189097,308940,涨,黄金,2024-07-17,0,585.840";';
const sampleAG0Line =
  'var hq_str_AG0="白银现货,145959,8100.00,8283.00,8100.00,8159.00,8131.00,8132.00,8131.00,0.00,8140.00,12,5,362231,480672,涨,白银,2024-07-17,0,8385.000";';
const sampleFullResponse = `${sampleAU0Line}\n${sampleAG0Line}\n`;

describe('parseSinaLine', () => {
  it('extracts price and prevClose from AU0 line', () => {
    const result = parseSinaLine(sampleAU0Line, 'AU0', 'AU9999');
    expect(result).toEqual({
      id: 'AU9999',
      price: 574.86,
      prevClose: 585.84,
      currency: 'CNY',
      unit: 'g',
      quoteTime: expect.any(Number),
      source: 'sina',
    });
  });

  it('returns null for non-matching symbol', () => {
    expect(parseSinaLine(sampleAU0Line, 'OTHER', 'AU9999')).toBe(null);
  });

  it('returns null for malformed line (not JSONP)', () => {
    expect(parseSinaLine('garbage data', 'AU0', 'AU9999')).toBe(null);
  });

  it('returns null when fields are too few', () => {
    expect(parseSinaLine('var hq_str_AU0="a,b,c";', 'AU0', 'AU9999')).toBe(null);
  });

  it('returns null when price/prevClose are non-numeric', () => {
    expect(parseSinaLine('var hq_str_AU0="黄金现货,145957,abc,def,1";', 'AU0', 'AU9999')).toBe(null);
  });

  it('returns null for null/undefined input', () => {
    expect(parseSinaLine(null, 'AU0', 'AU9999')).toBe(null);
    expect(parseSinaLine(undefined, 'AU0', 'AU9999')).toBe(null);
  });
});

describe('parseSinaTime', () => {
  it('parses HHMMSS + YYYY-MM-DD into a unix ms', () => {
    const ms = parseSinaTime('145957', '2024-07-17');
    expect(ms).toBe(new Date(2024, 6, 17, 14, 59, 57).getTime());
  });

  it('returns Date.now() when fields are missing', () => {
    const before = Date.now();
    const ms = parseSinaTime(null, null);
    const after = Date.now();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it('returns Date.now() when format is invalid', () => {
    const before = Date.now();
    const ms = parseSinaTime('nope', '2024-07-17');
    const after = Date.now();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });
});

describe('parseSinaResponse', () => {
  it('parses multiple symbols with symbol→metal mapping', () => {
    const quotes = parseSinaResponse(sampleFullResponse, { AU0: 'AU9999', AG0: 'AG9999' });
    expect(quotes.AU9999).toBeDefined();
    expect(quotes.AU9999.price).toBe(574.86);
    expect(quotes.AU9999.prevClose).toBe(585.84);
    expect(quotes.AG9999).toBeDefined();
    expect(quotes.AG9999.price).toBe(8100.0);
  });

  it('skips symbols not in mapping', () => {
    const quotes = parseSinaResponse(sampleFullResponse, { AU0: 'AU9999' });
    expect(quotes.AU9999).toBeDefined();
    expect(quotes.AG9999).toBeUndefined();
  });

  it('returns empty object for empty input', () => {
    expect(parseSinaResponse('', { AU0: 'AU9999' })).toEqual({});
  });
});

describe('fetchSinaQuotes', () => {
  it('builds URL with correct list parameter', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(sampleFullResponse);
    await fetchSinaQuotes(['AU0', 'AG0'], mockHttpGet);
    expect(mockHttpGet.mock.calls[0][0]).toBe('https://hq.sinajs.cn/list=AU0,AG0');
  });

  it('sets Referer header to finance.sina.com.cn', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(sampleFullResponse);
    await fetchSinaQuotes(['AU0'], mockHttpGet);
    const headers = mockHttpGet.mock.calls[0][1];
    expect(headers.Referer).toContain('finance.sina.com.cn');
  });

  it('returns parsed quotes when httpGet returns string', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(sampleFullResponse);
    const quotes = await fetchSinaQuotes(['AU0', 'AG0'], mockHttpGet);
    expect(quotes.AU9999).toBeDefined();
    expect(quotes.AG9999).toBeDefined();
  });

  it('throws on HTTP failure', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(fetchSinaQuotes(['AU0'], mockHttpGet)).rejects.toThrow('network error');
  });

  it('throws on unexpected response type', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(12345); // neither string
    await expect(fetchSinaQuotes(['AU0'], mockHttpGet)).rejects.toThrow(
      /Unexpected response type/
    );
  });
});