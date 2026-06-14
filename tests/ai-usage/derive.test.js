import { describe, test, expect } from 'vitest';
const {
  computeBurnRate,
  computeBlowUpAt,
  formatBlowUpIn,
} = require('../../src/ai-usage/derive');

describe('computeBurnRate', () => {
  test('returns null when prev missing', () => {
    expect(computeBurnRate({ used: 100, fetchedAt: 1000 }, null)).toBe(null);
  });

  test('returns null when used is identical (no consumption yet)', () => {
    const prev = { used: 100, fetchedAt: 1000 };
    const cur = { used: 100, fetchedAt: 5000 };
    expect(computeBurnRate(cur, prev)).toBe(null);
  });

  test('returns null when dt is zero or negative', () => {
    const prev = { used: 100, fetchedAt: 1000 };
    const cur = { used: 200, fetchedAt: 1000 };
    expect(computeBurnRate(cur, prev)).toBe(null);
  });

  test('returns null when used decreased (e.g. window reset)', () => {
    const prev = { used: 200, fetchedAt: 1000 };
    const cur = { used: 100, fetchedAt: 5000 };
    // used 减少说明窗口重置, 不算 burn rate
    expect(computeBurnRate(cur, prev)).toBe(null);
  });

  test('computes per-hour burn rate (1 unit / hour)', () => {
    const prev = { used: 100, fetchedAt: 1000 };
    const cur = { used: 103, fetchedAt: 1000 + 3 * 3600 * 1000 }; // 3h 后 used 涨 3
    const rate = computeBurnRate(cur, prev);
    expect(rate).toBe(1); // 1 per hour
  });

  test('computes per-hour burn rate (60 units / hour)', () => {
    const prev = { used: 0, fetchedAt: 0 };
    const cur = { used: 30, fetchedAt: 30 * 60 * 1000 }; // 30min 后 30 units
    const rate = computeBurnRate(cur, prev);
    expect(rate).toBe(60); // 60 per hour
  });

  test('rounds to 2 decimals', () => {
    const prev = { used: 0, fetchedAt: 0 };
    const cur = { used: 1, fetchedAt: 1000 * 60 * 60 * 7 }; // 7h 后 1 unit
    const rate = computeBurnRate(cur, prev);
    expect(rate).toBe(0.14); // 1/7 ≈ 0.1428 → 0.14
  });
});

describe('computeBlowUpAt', () => {
  test('returns null when no burn rate', () => {
    expect(computeBlowUpAt({ remaining: 100, fetchedAt: 1000 }, null)).toBe(null);
  });

  test('returns null when no remaining', () => {
    const prev = { used: 0, fetchedAt: 0 };
    const cur = { used: 10, fetchedAt: 3600 * 1000, remaining: null };
    expect(computeBlowUpAt(cur, prev)).toBe(null);
  });

  test('computes blow-up timestamp from burn rate', () => {
    const prev = { used: 0, fetchedAt: 0 };
    const cur = { used: 60, fetchedAt: 3600 * 1000, remaining: 540 }; // 60/h, 剩 540
    const blowUpAt = computeBlowUpAt(cur, prev);
    // 540 / 60 = 9 hours = 32400000 ms
    expect(blowUpAt).toBe(3600 * 1000 + 9 * 3600 * 1000);
  });

  test('returns null when remaining is 0 (already exhausted)', () => {
    const prev = { used: 0, fetchedAt: 0 };
    const cur = { used: 10, fetchedAt: 3600 * 1000, remaining: 0 };
    expect(computeBlowUpAt(cur, prev)).toBe(null);
  });

  test('caps blow-up to within 24h (suspicious rate sanity check)', () => {
    const prev = { used: 0, fetchedAt: 0 };
    const cur = { used: 1, fetchedAt: 60 * 1000, remaining: 1000000 }; // 1/min rate
    // rate=60/h, 1000000/60=16666h — 超 24h cap → null
    expect(computeBlowUpAt(cur, prev)).toBe(null);
  });
});

describe('formatBlowUpIn', () => {
  const NOW = 1_700_000_000_000; // 固定 now 让测试确定
  test('formats "X 小时后" for under 24h', () => {
    expect(formatBlowUpIn(NOW + 2 * 3600 * 1000, NOW)).toBe('2 小时后');
    expect(formatBlowUpIn(NOW + 30 * 60 * 1000, NOW)).toBe('30 分钟后');
  });
  test('formats "X 天后" for 24h+', () => {
    expect(formatBlowUpIn(NOW + 48 * 3600 * 1000, NOW)).toBe('2 天后');
  });
  test('returns null for invalid', () => {
    expect(formatBlowUpIn(null, NOW)).toBe(null);
    expect(formatBlowUpIn(NOW, NOW)).toBe(null); // 0 差
    expect(formatBlowUpIn(NOW - 1000, NOW)).toBe(null); // 过去
  });
});
