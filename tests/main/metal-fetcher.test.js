/**
 * tests/main/metal-fetcher.test.js
 *
 * Unified dispatcher 单测 — 覆盖:
 *   - buildFetcherPlan: 2 个 batch (sina-hf + eastmoney), symbol/secid 正确分组
 *   - fetchAllQuotes: 合并 quotes / fx / errors
 *   - Failure isolation: sina-hf fail 不阻塞 eastmoney, 反之亦然
 *   - 并发执行 (两个 batch 同时启动)
 *   - 两个都失败时 errors 都填充
 *
 * Sina hf_* row (international metals + FX) — verified 2026-06-17 layout:
 *   hf_GC: [0]current [6]time [7]prevClose [12]date
 *   hf_SI: same layout
 *   USDCNY: [0]time [5]mid [10]date
 *
 * Eastmoney 118.AU9999 / 118.AG9999 push2delay response (verified 2026-06-17):
 *   data.f43  最新价 (整数, ÷priceDivisor)
 *   data.f60  昨收   (整数, ÷priceDivisor)
 *   data.f86  时间戳 (unix 秒)
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchAllQuotes, buildFetcherPlan } from '../../src/metals/metal-fetcher.js';

const hfResponseBody =
  'var hq_str_hf_GC="4341.792,,4342.000,4342.400,4369.800,4337.100,16:19:54,4354.400,4352.600,0,1,2,2026-06-17,GC,0";\n' +
  'var hq_str_hf_SI="70.370,,70.410,70.425,71.130,70.370,16:18:23,70.539,70.635,0,1,1,2026-06-17,SI,0";\n' +
  'var hq_str_USDCNY="16:19:02,6.7566,6.7584,6.7590,39,6.7557,6.7584,6.7545,6.7575,USD,2026-06-17";\n';

// Eastmoney: f43=93918 → 939.18 (÷100), f60=94048 → 940.48 (÷100)
const au9999ResponseBody = JSON.stringify({
  rc: 0,
  data: {
    f43: 93918,
    f44: 94580,
    f45: 93700,
    f46: 94100,
    f57: 'AU9999',
    f58: '黄金9999',
    f60: 94048,
    f86: 1781682300,
    f170: -14,
  },
});

// Eastmoney: f43=1687500 → 16.875 (÷100000), f60=1669000 → 16.69 (÷100000)
const ag9999ResponseBody = JSON.stringify({
  rc: 0,
  data: {
    f43: 1687500,
    f44: 1687500,
    f45: 1687500,
    f46: 1687500,
    f57: 'AG9999',
    f58: '白银9999',
    f60: 1669000,
    f86: 1781682300,
    f170: 111,
  },
});

describe('buildFetcherPlan', () => {
  it('returns 2 batches (sina-hf + eastmoney)', () => {
    const plan = buildFetcherPlan();
    expect(plan).toHaveLength(2);
    expect(plan.find((p) => p.kind === 'sina-hf')).toBeDefined();
    expect(plan.find((p) => p.kind === 'eastmoney')).toBeDefined();
  });

  it('sina-hf batch contains hf_GC, hf_SI, USDCNY', () => {
    const hf = buildFetcherPlan().find((p) => p.kind === 'sina-hf');
    expect(hf.symbols).toContain('hf_GC');
    expect(hf.symbols).toContain('hf_SI');
    expect(hf.symbols).toContain('USDCNY');
  });

  it('eastmoney batch contains 118.AU9999, 118.AG9999', () => {
    const em = buildFetcherPlan().find((p) => p.kind === 'eastmoney');
    expect(em.secids).toContain('118.AU9999');
    expect(em.secids).toContain('118.AG9999');
  });
});

describe('fetchAllQuotes', () => {
  it('merges sina-hf + eastmoney results', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('sinajs.cn')) return hfResponseBody;
      if (url.includes('118.AU9999')) return au9999ResponseBody;
      if (url.includes('118.AG9999')) return ag9999ResponseBody;
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

    // eastmoney domestic metals — price ÷ priceDivisor
    expect(result.quotes.AU9999).toBeDefined();
    expect(result.quotes.AU9999.price).toBeCloseTo(939.18, 4);
    expect(result.quotes.AU9999.prevClose).toBeCloseTo(940.48, 4);
    expect(result.quotes.AU9999.unit).toBe('g');
    expect(result.quotes.AU9999.currency).toBe('CNY');
    expect(result.quotes.AU9999.source).toBe('eastmoney');

    expect(result.quotes.AG9999).toBeDefined();
    expect(result.quotes.AG9999.price).toBeCloseTo(16.875, 4);
    expect(result.quotes.AG9999.prevClose).toBeCloseTo(16.69, 4);

    // No errors
    expect(result.errors).toEqual({});
  });

  it('isolates failures — sina-hf down, eastmoney succeeds', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('sinajs.cn')) throw new Error('hf down');
      if (url.includes('118.AU9999')) return au9999ResponseBody;
      if (url.includes('118.AG9999')) return ag9999ResponseBody;
      throw new Error('unexpected url: ' + url);
    });

    const result = await fetchAllQuotes(mockHttpGet);

    expect(result.quotes.AU9999).toBeDefined();
    expect(result.quotes.AG9999).toBeDefined();
    expect(result.errors['sina-hf']).toBeDefined();
    expect(result.errors['sina-hf'].message).toBe('hf down');
    expect(result.errors['eastmoney']).toBeUndefined();
  });

  it('isolates failures — eastmoney down, sina-hf succeeds', async () => {
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      if (url.includes('sinajs.cn')) return hfResponseBody;
      if (url.includes('eastmoney.com')) throw new Error('em down');
      throw new Error('unexpected url: ' + url);
    });

    const result = await fetchAllQuotes(mockHttpGet);

    expect(result.quotes.XAU).toBeDefined();
    expect(result.fx.CNY_PER_USD).toBeDefined();
    // eastmoney 整体失败 (两个 secid 都 down) → fetcher 抛聚合错, dispatcher 登记到 errors.eastmoney
    expect(result.errors['eastmoney']).toBeDefined();
    expect(result.errors['eastmoney'].message).toMatch(/all 2 symbol\(s\) failed/);
    expect(result.errors['eastmoney'].message).toContain('em down');
    expect(result.errors['sina-hf']).toBeUndefined();
  });

  it('both fail — errors populated, quotes empty', async () => {
    const mockHttpGet = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchAllQuotes(mockHttpGet);
    expect(result.errors['sina-hf']).toBeDefined();
    expect(result.errors['eastmoney']).toBeDefined();
    expect(Object.keys(result.quotes)).toHaveLength(0);
    expect(Object.keys(result.fx)).toHaveLength(0);
  });

  it('runs sina-hf and eastmoney concurrently', async () => {
    const startTimes = { hf: 0, em: 0 };
    const mockHttpGet = vi.fn().mockImplementation(async (url) => {
      const isHf = url.includes('sinajs.cn');
      const which = isHf ? 'hf' : 'em';
      startTimes[which] = Date.now();
      await new Promise((r) => setTimeout(r, 30));
      return isHf ? hfResponseBody : au9999ResponseBody;
    });

    await fetchAllQuotes(mockHttpGet);

    // Both should have started within 5ms of each other (concurrent, not serial)
    expect(Math.abs(startTimes.hf - startTimes.em)).toBeLessThan(5);
  });
});
