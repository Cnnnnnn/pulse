/**
 * tests/main/metal-fetcher.test.js
 *
 * Unified dispatcher 单测 — 覆盖:
 *   - buildFetcherPlan: 2 个 batch (sina-hf + sina-jsonp), symbol 正确分组
 *   - fetchAllQuotes: 合并 quotes / fx / errors
 *   - Failure isolation: sina-hf fail 不阻塞 sina-jsonp, 反之亦然
 *   - 并发执行 (两个 batch 同时启动)
 *   - 两个都失败时 errors 都填充
 *
 * 注意: sina-hf 和 sina-jsonp 走同一个域名 hq.sinajs.cn, mock 靠 URL
 * 里的 `list=hf_GC`(或 USDCNY) vs `list=AU0` 区分两种响应.
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchAllQuotes, buildFetcherPlan } from '../../src/metals/metal-fetcher.js';

// Sina hf_* row (international metals + FX) — verified 2026-06-17 layout:
//   hf_GC: [0]current [6]time [7]prevClose [12]date
//   hf_SI: same layout
//   USDCNY: [0]time [5]mid [10]date
const hfResponseBody =
  'var hq_str_hf_GC="4341.792,,4342.000,4342.400,4369.800,4337.100,16:19:54,4354.400,4352.600,0,1,2,2026-06-17,GC,0";\n' +
  'var hq_str_hf_SI="70.370,,70.410,70.425,71.130,70.370,16:18:23,70.539,70.635,0,1,1,2026-06-17,SI,0";\n' +
  'var hq_str_USDCNY="16:19:02,6.7566,6.7584,6.7590,39,6.7557,6.7584,6.7545,6.7575,USD,2026-06-17";\n';

// Sina jsonp row (domestic metals) — same format as metal-sina-fetcher test:
//   AU0/AG0: [1]time(HHMMSS) [2]current [3]prevClose [16]date
const sinaResponseBody =
  'var hq_str_AU0="黄金现货,145957,574.86,585.84,574.40,585.84,574.40,574.86,585.84,0,0,0,0,0,0,0,2024-07-17";\n' +
  'var hq_str_AG0="白银现货,145959,8100.00,8283.00,8100.00,8283.00,8100.00,8100.00,8283.00,0,0,0,0,0,0,0,2024-07-17";\n';

describe('buildFetcherPlan', () => {
  it('returns 2 batches (sina-hf + sina-jsonp)', () => {
    const plan = buildFetcherPlan();
    expect(plan).toHaveLength(2);
    expect(plan.find((p) => p.kind === 'sina-hf')).toBeDefined();
    expect(plan.find((p) => p.kind === 'sina-jsonp')).toBeDefined();
  });

  it('sina-hf batch contains hf_GC, hf_SI, USDCNY', () => {
    const hf = buildFetcherPlan().find((p) => p.kind === 'sina-hf');
    expect(hf.symbols).toContain('hf_GC');
    expect(hf.symbols).toContain('hf_SI');
    expect(hf.symbols).toContain('USDCNY');
  });

  it('sina-jsonp batch contains AU0, AG0', () => {
    const sina = buildFetcherPlan().find((p) => p.kind === 'sina-jsonp');
    expect(sina.symbols).toContain('AU0');
    expect(sina.symbols).toContain('AG0');
  });
});

describe('fetchAllQuotes', () => {
  it('merges sina-hf + sina-jsonp results', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      // hf_GC / hf_SI / USDCNY all appear only in the sina-hf batch URL
      if (url.includes('hf_GC') || url.includes('USDCNY')) return hfResponseBody;
      if (url.includes('AU0')) return sinaResponseBody;
      throw new Error('unexpected url: ' + url);
    });

    const result = await fetchAllQuotes(mockHttpGet);

    // sina-hf metals — price comes straight from [0], no priceScale
    expect(result.quotes.XAU).toBeDefined();
    expect(result.quotes.XAU.price).toBeCloseTo(4341.792, 3);
    expect(result.quotes.XAU.prevClose).toBeCloseTo(4354.400, 3);
    expect(result.quotes.XAU.unit).toBe('oz');
    expect(result.quotes.XAU.currency).toBe('USD');
    expect(result.quotes.XAU.source).toBe('sina-hf');

    expect(result.quotes.XAG).toBeDefined();
    expect(result.quotes.XAG.price).toBeCloseTo(70.370, 3);

    // FX — mid price from [5]
    expect(result.fx.CNY_PER_USD).toBeDefined();
    expect(result.fx.CNY_PER_USD.rate).toBeCloseTo(6.7557, 4);

    // sina-jsonp metals
    expect(result.quotes.AU9999).toBeDefined();
    expect(result.quotes.AU9999.price).toBe(574.86);
    expect(result.quotes.AU9999.unit).toBe('g');
    expect(result.quotes.AU9999.currency).toBe('CNY');

    expect(result.quotes.AG9999).toBeDefined();
    expect(result.quotes.AG9999.price).toBe(8100.0);

    // No errors
    expect(result.errors).toEqual({});
  });

  it('isolates failures — sina-hf down, sina-jsonp succeeds', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('hf_GC') || url.includes('USDCNY')) throw new Error('hf down');
      if (url.includes('AU0')) return sinaResponseBody;
      throw new Error('unexpected url: ' + url);
    });

    const result = await fetchAllQuotes(mockHttpGet);

    expect(result.quotes.AU9999).toBeDefined();
    expect(result.quotes.AG9999).toBeDefined();
    expect(result.errors['sina-hf']).toBeDefined();
    expect(result.errors['sina-hf'].message).toBe('hf down');
    expect(result.errors['sina-jsonp']).toBeUndefined();
  });

  it('isolates failures — sina-jsonp down, sina-hf succeeds', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('hf_GC') || url.includes('USDCNY')) return hfResponseBody;
      if (url.includes('AU0')) throw new Error('jsonp down');
      throw new Error('unexpected url: ' + url);
    });

    const result = await fetchAllQuotes(mockHttpGet);

    expect(result.quotes.XAU).toBeDefined();
    expect(result.fx.CNY_PER_USD).toBeDefined();
    expect(result.errors['sina-jsonp']).toBeDefined();
    expect(result.errors['sina-jsonp'].message).toBe('jsonp down');
    expect(result.errors['sina-hf']).toBeUndefined();
  });

  it('both fail — errors populated, quotes empty', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchAllQuotes(mockHttpGet);
    expect(result.errors['sina-hf']).toBeDefined();
    expect(result.errors['sina-jsonp']).toBeDefined();
    expect(Object.keys(result.quotes)).toHaveLength(0);
    expect(Object.keys(result.fx)).toHaveLength(0);
  });

  it('runs sina-hf and sina-jsonp concurrently', async () => {
    const startTimes = { hf: 0, jsonp: 0 };
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      const isHf = url.includes('hf_GC') || url.includes('USDCNY');
      const which = isHf ? 'hf' : 'jsonp';
      startTimes[which] = Date.now();
      await new Promise((r) => setTimeout(r, 30));
      return isHf ? hfResponseBody : sinaResponseBody;
    });

    await fetchAllQuotes(mockHttpGet);

    // Both should have started within 5ms of each other (concurrent, not serial)
    expect(Math.abs(startTimes.hf - startTimes.jsonp)).toBeLessThan(5);
  });
});
