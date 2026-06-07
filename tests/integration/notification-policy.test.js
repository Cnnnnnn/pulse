/**
 * tests/integration/notification-policy.test.js
 *
 * Phase 17: 通知抑制策略.
 *   - parseHHMM: "23:00" / "08:00" / invalid
 *   - inQuietHours: 跨午夜 / 同日内 / 0-length 窗口
 *   - suppressedByCooldown: state 没记录 / 在窗口内 / 窗口外
 */

import { describe, it, expect } from 'vitest';
import {
  parseHHMM,
  inQuietHours,
  suppressedByCooldown,
} from '../../src/main/notification-policy.js';

describe('parseHHMM', () => {
  it('合法格式', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('08:00')).toBe(480);
    expect(parseHHMM('23:59')).toBe(23 * 60 + 59);
    expect(parseHHMM('12:30')).toBe(750);
  });

  it('h 1 位数也接受', () => {
    expect(parseHHMM('9:30')).toBe(9 * 60 + 30);
  });

  it('非法格式返回 null', () => {
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('12-30')).toBeNull();
    expect(parseHHMM('not a time')).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM(undefined)).toBeNull();
    expect(parseHHMM(123)).toBeNull();
  });
});

describe('inQuietHours', () => {
  it('跨午夜 23:00-08:00, 凌晨 02:00 在静默', () => {
    expect(inQuietHours(new Date('2026-06-06T02:00'), '23:00', '08:00')).toBe(true);
    expect(inQuietHours(new Date('2026-06-06T05:30'), '23:00', '08:00')).toBe(true);
    expect(inQuietHours(new Date('2026-06-06T23:30'), '23:00', '08:00')).toBe(true);  // 还在静默开始端
  });

  it('跨午夜 23:00-08:00, 白天不在静默', () => {
    expect(inQuietHours(new Date('2026-06-06T10:00'), '23:00', '08:00')).toBe(false);
    expect(inQuietHours(new Date('2026-06-06T15:00'), '23:00', '08:00')).toBe(false);
  });

  it('同日内 09:00-17:00, 上班时间在静默', () => {
    expect(inQuietHours(new Date('2026-06-06T10:00'), '09:00', '17:00')).toBe(true);
    expect(inQuietHours(new Date('2026-06-06T16:30'), '09:00', '17:00')).toBe(true);
  });

  it('同日内 09:00-17:00, 非上班时间不在静默', () => {
    expect(inQuietHours(new Date('2026-06-06T08:30'), '09:00', '17:00')).toBe(false);
    expect(inQuietHours(new Date('2026-06-06T18:00'), '09:00', '17:00')).toBe(false);
  });

  it('0-length 窗口 (start=end) → 不限制', () => {
    expect(inQuietHours(new Date('2026-06-06T10:00'), '09:00', '09:00')).toBe(false);
  });

  it('非法的 start/end → 不限制 (走默认 "不静默")', () => {
    expect(inQuietHours(new Date('2026-06-06T10:00'), null, null)).toBe(false);
    expect(inQuietHours(new Date('2026-06-06T10:00'), 'invalid', 'also invalid')).toBe(false);
  });
});

describe('suppressedByCooldown', () => {
  const NOW = new Date('2026-06-06T12:00:00').getTime();
  const HOUR = 60 * 60 * 1000;

  it('cooldownMs=0 → 不抑制', () => {
    const state = { apps: { X: { last_notified: NOW - 1 } } };
    expect(suppressedByCooldown([{ name: 'X', has_update: true }], state, 0, NOW)).toEqual([]);
  });

  it('app 没在 state 里 → 不抑制', () => {
    const state = { apps: {} };
    expect(suppressedByCooldown([{ name: 'X', has_update: true }], state, 24 * HOUR, NOW)).toEqual([]);
  });

  it('last_notified 在窗口内 (1h 前, 24h 窗口) → 抑制', () => {
    const state = { apps: { X: { last_notified: NOW - 1 * HOUR } } };
    expect(suppressedByCooldown([{ name: 'X', has_update: true }], state, 24 * HOUR, NOW)).toEqual(['X']);
  });

  it('last_notified 在窗口外 (25h 前, 24h 窗口) → 不抑制', () => {
    const state = { apps: { X: { last_notified: NOW - 25 * HOUR } } };
    expect(suppressedByCooldown([{ name: 'X', has_update: true }], state, 24 * HOUR, NOW)).toEqual([]);
  });

  it('has_update=false 不算 (跳过不通知的就不该被 cooldown 跟踪)', () => {
    const state = { apps: { X: { last_notified: NOW - 1 * HOUR } } };
    expect(suppressedByCooldown([{ name: 'X', has_update: false }], state, 24 * HOUR, NOW)).toEqual([]);
  });

  it('多个 app 部分在 cooldown', () => {
    const state = {
      apps: {
        A: { last_notified: NOW - 1 * HOUR },  // 在
        B: { last_notified: NOW - 25 * HOUR }, // 不在
        C: { last_notified: NOW - 30 * HOUR }, // 不在
      },
    };
    const results = [
      { name: 'A', has_update: true },
      { name: 'B', has_update: true },
      { name: 'C', has_update: true },
    ];
    expect(suppressedByCooldown(results, state, 24 * HOUR, NOW)).toEqual(['A']);
  });

  it('state.apps undefined → 当成空', () => {
    expect(suppressedByCooldown([{ name: 'X', has_update: true }], undefined, 24 * HOUR, NOW)).toEqual([]);
    expect(suppressedByCooldown([{ name: 'X', has_update: true }], {}, 24 * HOUR, NOW)).toEqual([]);
  });

  it('不传 now → 用 Date.now() (不会因为 NOW 巧合失败)', () => {
    const state = { apps: { X: { last_notified: Date.now() - 1000 } } };
    expect(suppressedByCooldown([{ name: 'X', has_update: true }], state, 60000)).toEqual(['X']);
  });
});
