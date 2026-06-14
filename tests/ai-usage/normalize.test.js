import { describe, test, expect } from 'vitest';
const { _pickNumber, _pickString, _parseDdHhMmSs, normalize } = require('../../src/ai-usage/normalize');

describe('_pickNumber', () => {
  test('returns first present key value as number', () => {
    expect(_pickNumber({ a: '42', b: 100 }, ['a', 'b'])).toBe(42);
    expect(_pickNumber({ b: 100 }, ['a', 'b'])).toBe(100);
  });
  test('coerces numeric string to number', () => {
    expect(_pickNumber({ x: '6000' }, ['x'])).toBe(6000);
  });
  test('returns null when no candidate key present', () => {
    expect(_pickNumber({ foo: 1 }, ['a', 'b'])).toBe(null);
  });
  test('returns null for negative or NaN', () => {
    expect(_pickNumber({ x: -5 }, ['x'])).toBe(null);
    expect(_pickNumber({ x: 'abc' }, ['x'])).toBe(null);
    expect(_pickNumber({ x: NaN }, ['x'])).toBe(null);
  });
  test('returns null when obj is null/undefined', () => {
    expect(_pickNumber(null, ['x'])).toBe(null);
    expect(_pickNumber(undefined, ['x'])).toBe(null);
  });
  test('returns null when keys is empty', () => {
    expect(_pickNumber({ x: 5 }, [])).toBe(null);
  });
});

describe('_pickString', () => {
  test('returns first present key value as string', () => {
    expect(_pickString({ a: 'hello', b: 'world' }, ['a', 'b'])).toBe('hello');
    expect(_pickString({ b: 'world' }, ['a', 'b'])).toBe('world');
  });
  test('coerces non-string to string', () => {
    expect(_pickString({ x: 42 }, ['x'])).toBe('42');
  });
  test('returns null when no candidate key present', () => {
    expect(_pickString({ foo: 1 }, ['a', 'b'])).toBe(null);
  });
  test('returns null when obj is null/undefined', () => {
    expect(_pickString(null, ['x'])).toBe(null);
  });
});

describe('_parseDdHhMmSs', () => {
  test('parses DD:HH:MM:SS to total seconds', () => {
    expect(_parseDdHhMmSs('00:01:00:00')).toBe(3600);
    expect(_parseDdHhMmSs('01:00:00:00')).toBe(86400);
    expect(_parseDdHhMmSs('00:00:01:00')).toBe(60);
    expect(_parseDdHhMmSs('00:00:00:30')).toBe(30);
    expect(_parseDdHhMmSs('00:00:00:00')).toBe(0);
  });
  test('returns null for malformed input', () => {
    expect(_parseDdHhMmSs('garbage')).toBe(null);
    expect(_parseDdHhMmSs('')).toBe(null);
    expect(_parseDdHhMmSs(null)).toBe(null);
    expect(_parseDdHhMmSs(undefined)).toBe(null);
  });
  test('returns null for partial input', () => {
    expect(_parseDdHhMmSs('01:02:03')).toBe(null);
  });
});

const OK_FIXTURE = {
  base_resp: { status_code: 0, status_msg: 'success' },
  model_remains: [
    {
      current_interval_total_count: 6000,
      current_interval_usage_count: 4200,
      interval_remains_time: '00:04:59:30',
      current_weekly_total_count: 50000,
      current_weekly_usage_count: 38000,
      weekly_remains_time: '05:22:00:00',
    },
  ],
};

describe('normalize', () => {
  test('extracts full 5h + weekly windows', () => {
    const r = normalize(OK_FIXTURE, { fetchedAt: 1000, endpoint: 'https://x', provider: 'minimax', region: 'cn' });
    expect(r.ok).toBe(true);
    expect(r.snapshot.provider).toBe('minimax');
    expect(r.snapshot.region).toBe('cn');
    expect(r.snapshot.fetchedAt).toBe(1000);
    expect(r.snapshot.windows['5h']).toEqual({
      total: 6000,
      remaining: 4200,
      used: 1800,
      resetAt: 1000 + (4 * 3600 + 59 * 60 + 30) * 1000,
      resetInSec: 4 * 3600 + 59 * 60 + 30,
      label: '5 小时滚动窗口',
    });
    expect(r.snapshot.windows.weekly.total).toBe(50000);
    expect(r.snapshot.windows.weekly.remaining).toBe(38000);
    expect(r.snapshot.windows.weekly.used).toBe(12000);
    expect(r.snapshot.credits).toBe(null);
  });

  test('treats current_interval_usage_count as REMAINING (not used)', () => {
    const r = normalize(OK_FIXTURE, { fetchedAt: 0 });
    expect(r.snapshot.windows['5h'].remaining).toBe(4200);
    expect(r.snapshot.windows['5h'].used).toBe(6000 - 4200);
  });

  test('returns ok=false when base_resp.status_code !== 0', () => {
    const r = normalize({ base_resp: { status_code: 1004, status_msg: 'cookie missing' } }, {});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('api_error');
    expect(r.error).toBe('cookie missing');
  });

  test('returns ok=true with empty windows when model_remains absent', () => {
    const r = normalize({ base_resp: { status_code: 0 } }, { fetchedAt: 0 });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows).toEqual({});
  });

  test('5h window null when fields missing, weekly still parsed', () => {
    const partial = {
      base_resp: { status_code: 0 },
      model_remains: [
        {
          current_weekly_total_count: 50000,
          current_weekly_usage_count: 38000,
          weekly_remains_time: '05:22:00:00',
        },
      ],
    };
    const r = normalize(partial, { fetchedAt: 0 });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows['5h']).toBe(null);
    expect(r.snapshot.windows.weekly.total).toBe(50000);
  });

  test('coerces string numbers', () => {
    const strNum = {
      base_resp: { status_code: 0 },
      model_remains: [
        {
          current_interval_total_count: '6000',
          current_interval_usage_count: '4200',
          interval_remains_time: '00:01:00:00',
        },
      ],
    };
    const r = normalize(strNum, { fetchedAt: 0 });
    expect(r.snapshot.windows['5h'].total).toBe(6000);
    expect(r.snapshot.windows['5h'].used).toBe(1800);
  });

  test('falls back to old field names via _pickNumber', () => {
    const oldSchema = {
      base_resp: { status_code: 0 },
      coding_plan_remains: [
        {
          current_interval_total_count: 6000,
          current_interval_usage_count: 4200,
          interval_remains_time: '00:01:00:00',
        },
      ],
    };
    const r = normalize(oldSchema, { fetchedAt: 0 });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows['5h']).not.toBe(null);
  });

  test('returns ok=false when input is not an object', () => {
    expect(normalize(null, {}).ok).toBe(false);
    expect(normalize('string', {}).ok).toBe(false);
  });
});
