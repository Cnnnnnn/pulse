/**
 * tests/main/metal-sina-hf-fetcher.test.js
 *
 * 单测 Sina hf_* fetcher (国际现货金属 + 汇率). 覆盖:
 *   - buildHfUrl: URL 拼接
 *   - parseHfMetalLine: hf_GC / hf_SI 行解析 (price/prevClose/time)
 *   - parseHfFxLine: USDCNY 行解析 (mid price)
 *   - parseHfResponse: 完整响应解析 (金属 + 汇率)
 *   - parseHfTime: 时间字段 → unix ms
 *   - fetchHfQuotes: 端到端 (mock httpGet)
 *   - 边界: 空响应 / 字段不足 / 非法数字 / 空 payload
 *
 * 字段布局参考 metal-sina-hf-fetcher.js 头部注释 (2026-06-17 实测确认).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  fetchHfQuotes,
  parseHfResponse,
  parseHfMetalLine,
  parseHfFxLine,
  parseHfTime,
  buildHfUrl,
} from '../../src/metals/metal-sina-hf-fetcher.js';

const sampleHfResponse =
  'var hq_str_hf_GC="4341.792,,4342.000,4342.400,4369.800,4337.100,16:19:54,4354.400,4352.600,0,1,2,2026-06-17,GC,0";\n' +
  'var hq_str_hf_SI="70.370,,70.410,70.425,71.130,70.370,16:18:23,70.539,70.635,0,1,1,2026-06-17,SI,0";\n' +
  'var hq_str_USDCNY="16:19:02,6.7566,6.7584,6.7590,39,6.7557,6.7584,6.7545,6.7575,USD,2026-06-17";\n';

describe('buildHfUrl', () => {
  it('joins symbols into a single list URL', () => {
    const url = buildHfUrl(['hf_GC', 'hf_SI', 'USDCNY']);
    expect(url).toBe('https://hq.sinajs.cn/list=hf_GC,hf_SI,USDCNY');
  });

  it('handles a single symbol', () => {
    expect(buildHfUrl(['hf_GC'])).toBe('https://hq.sinajs.cn/list=hf_GC');
  });
});

describe('parseHfTime', () => {
  it('parses HH:MM:SS + YYYY-MM-DD into ms', () => {
    const ms = parseHfTime('16:19:54', '2026-06-17');
    expect(new Date(ms).getFullYear()).toBe(2026);
    expect(new Date(ms).getHours()).toBe(16);
    expect(new Date(ms).getMinutes()).toBe(19);
  });

  it('falls back to Date.now() on malformed time', () => {
    const before = Date.now();
    const ms = parseHfTime('bad', '2026-06-17');
    const after = Date.now();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it('falls back to Date.now() on missing fields', () => {
    expect(parseHfTime('', '2026-06-17')).toEqual(expect.any(Number));
    expect(parseHfTime('16:19:54', '')).toEqual(expect.any(Number));
  });
});

describe('parseHfMetalLine', () => {
  const meta = { unit: 'oz', currency: 'USD' };

  it('parses a valid hf_GC payload', () => {
    const payload =
      '4341.792,,4342.000,4342.400,4369.800,4337.100,16:19:54,4354.400,4352.600,0,1,2,2026-06-17,GC,0';
    const q = parseHfMetalLine(payload, 'XAU', meta);
    expect(q).toEqual({
      id: 'XAU',
      price: 4341.792,
      prevClose: 4354.4,
      currency: 'USD',
      unit: 'oz',
      quoteTime: expect.any(Number),
      source: 'sina-hf',
    });
  });

  it('parses hf_SI payload', () => {
    const payload =
      '70.370,,70.410,70.425,71.130,70.370,16:18:23,70.539,70.635,0,1,1,2026-06-17,SI,0';
    const q = parseHfMetalLine(payload, 'XAG', meta);
    expect(q.id).toBe('XAG');
    expect(q.price).toBeCloseTo(70.37, 3);
    expect(q.prevClose).toBeCloseTo(70.539, 3);
  });

  it('returns null when not enough fields', () => {
    expect(parseHfMetalLine('4341.792,1,2', 'XAU', meta)).toBeNull();
  });

  it('returns null when price is non-numeric', () => {
    const payload =
      'bad,,1,2,3,4,16:19:54,5,6,0,1,2,2026-06-17,GC,0';
    expect(parseHfMetalLine(payload, 'XAU', meta)).toBeNull();
  });

  it('returns null when prevClose is non-numeric', () => {
    const payload =
      '4341.792,,1,2,3,4,16:19:54,bad,6,0,1,2,2026-06-17,GC,0';
    expect(parseHfMetalLine(payload, 'XAU', meta)).toBeNull();
  });
});

describe('parseHfFxLine', () => {
  it('parses USDCNY mid price from [5]', () => {
    const payload = '16:19:02,6.7566,6.7584,6.7590,39,6.7557,6.7584,6.7545,6.7575,USD,2026-06-17';
    const fx = parseHfFxLine(payload);
    expect(fx.rate).toBeCloseTo(6.7557, 4);
    expect(fx.fetchedAt).toEqual(expect.any(Number));
    expect(fx.quoteTime).toEqual(expect.any(Number));
  });

  it('returns null when mid is non-numeric', () => {
    const payload = '16:19:02,6.7566,6.7584,6.7590,39,bad,6.7584,6.7545,6.7575,USD,2026-06-17';
    expect(parseHfFxLine(payload)).toBeNull();
  });

  it('returns null when mid is zero or negative', () => {
    const payload = '16:19:02,1,2,3,4,0,6,7,8,USD,2026-06-17';
    expect(parseHfFxLine(payload)).toBeNull();
  });

  it('returns null when not enough fields', () => {
    expect(parseHfFxLine('1,2,3')).toBeNull();
  });
});

describe('parseHfResponse', () => {
  const symbolToMetal = {
    hf_GC: { metalId: 'XAU', meta: { unit: 'oz', currency: 'USD' } },
    hf_SI: { metalId: 'XAG', meta: { unit: 'oz', currency: 'USD' } },
  };
  const symbolToFx = { USDCNY: 'CNY_PER_USD' };

  it('parses metals + fx from a full response', () => {
    const { quotes, fx } = parseHfResponse(sampleHfResponse, symbolToMetal, symbolToFx);
    expect(Object.keys(quotes).sort()).toEqual(['XAG', 'XAU']);
    expect(quotes.XAU.price).toBeCloseTo(4341.792, 3);
    expect(quotes.XAG.price).toBeCloseTo(70.37, 3);
    expect(fx.CNY_PER_USD.rate).toBeCloseTo(6.7557, 4);
  });

  it('returns empty buckets for empty text', () => {
    const { quotes, fx } = parseHfResponse('', symbolToMetal, symbolToFx);
    expect(quotes).toEqual({});
    expect(fx).toEqual({});
  });

  it('skips symbols missing from the response', () => {
    // only hf_GC present
    const partial =
      'var hq_str_hf_GC="4341.792,,4342.000,4342.400,4369.800,4337.100,16:19:54,4354.400,4352.600,0,1,2,2026-06-17,GC,0";\n';
    const { quotes, fx } = parseHfResponse(partial, symbolToMetal, symbolToFx);
    expect(quotes.XAU).toBeDefined();
    expect(quotes.XAG).toBeUndefined();
    expect(fx.CNY_PER_USD).toBeUndefined();
  });
});

describe('fetchHfQuotes', () => {
  it('fetches + parses metals and fx end-to-end', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue(sampleHfResponse);
    const symbolToMetal = {
      hf_GC: { metalId: 'XAU', meta: { unit: 'oz', currency: 'USD' } },
      hf_SI: { metalId: 'XAG', meta: { unit: 'oz', currency: 'USD' } },
    };
    const symbolToFx = { USDCNY: 'CNY_PER_USD' };

    const result = await fetchHfQuotes(
      ['hf_GC', 'hf_SI', 'USDCNY'],
      mockHttpGet,
      symbolToMetal,
      symbolToFx,
    );

    expect(result.quotes.XAU.price).toBeCloseTo(4341.792, 3);
    expect(result.quotes.XAG.price).toBeCloseTo(70.37, 3);
    expect(result.fx.CNY_PER_USD.rate).toBeCloseTo(6.7557, 4);
    // Should have called the Sina URL with all three symbols
    expect(mockHttpGet).toHaveBeenCalledWith(
      'https://hq.sinajs.cn/list=hf_GC,hf_SI,USDCNY',
      expect.objectContaining({ Referer: 'https://finance.sina.com.cn' }),
    );
  });

  it('throws when response is not a string', async () => {
    const mockHttpGet = vi.fn().mockResolvedValue({ not: 'a string' });
    await expect(
      fetchHfQuotes(['hf_GC'], mockHttpGet, {}, {}),
    ).rejects.toThrow(/Unexpected response type/);
  });

  it('propagates network errors from httpGet', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      fetchHfQuotes(['hf_GC'], mockHttpGet, {}, {}),
    ).rejects.toThrow('network down');
  });
});
