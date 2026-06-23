/**
 * tests/main/schedulers-auto-check.test.js
 *
 * C4: 后台 auto-check 智能时间窗. decideAutoCheck 是纯决策函数,
 * checkOnce 是执行函数 (内部调 decideAutoCheck + runCheckQueued).
 * startAutoCheckTimer 暴露 { stop, triggerNow } 便于测试, 照搬
 * daily-summary-job 的可测性模式.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  decideAutoCheck,
  startAutoCheckTimer,
  __resetForTest,
} from '../../src/main/bootstrap/schedulers.js';

describe('decideAutoCheck', () => {
  const INTERVAL = 6 * 60 * 60 * 1000; // 6h

  it('returns run when quiet hours not configured', () => {
    expect(
      decideAutoCheck({
        now: new Date('2026-06-23T03:00:00'),
        quietStart: null,
        quietEnd: null,
        lastAutoCheckAt: null,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'run' });
  });

  it('returns skip/quiet_hours inside cross-midnight quiet window', () => {
    expect(
      decideAutoCheck({
        now: new Date('2026-06-23T03:00:00'),
        quietStart: '23:00',
        quietEnd: '08:00',
        lastAutoCheckAt: null,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'skip', reason: 'quiet_hours' });
  });

  it('returns skip/quiet_hours inside same-day quiet window', () => {
    expect(
      decideAutoCheck({
        now: new Date('2026-06-23T12:00:00'),
        quietStart: '09:00',
        quietEnd: '17:00',
        lastAutoCheckAt: null,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'skip', reason: 'quiet_hours' });
  });

  it('returns run when quiet hours ended and lastAutoCheckAt is null (catch-up)', () => {
    expect(
      decideAutoCheck({
        now: new Date('2026-06-23T09:00:00'),
        quietStart: '23:00',
        quietEnd: '08:00',
        lastAutoCheckAt: null,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'run' });
  });

  it('returns skip/too_soon when within interval of last check', () => {
    const now = new Date('2026-06-23T10:00:00');
    const twoHoursAgo = now.getTime() - 2 * 60 * 60 * 1000;
    expect(
      decideAutoCheck({
        now,
        quietStart: null,
        quietEnd: null,
        lastAutoCheckAt: twoHoursAgo,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'skip', reason: 'too_soon' });
  });

  it('returns run when beyond interval of last check', () => {
    const now = new Date('2026-06-23T10:00:00');
    const sevenHoursAgo = now.getTime() - 7 * 60 * 60 * 1000;
    expect(
      decideAutoCheck({
        now,
        quietStart: null,
        quietEnd: null,
        lastAutoCheckAt: sevenHoursAgo,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'run' });
  });

  it('quiet_hours takes priority over too_soon', () => {
    const now = new Date('2026-06-23T03:00:00');
    const recent = now.getTime() - 60_000; // 1 分钟前
    expect(
      decideAutoCheck({
        now,
        quietStart: '23:00',
        quietEnd: '08:00',
        lastAutoCheckAt: recent,
        intervalMs: INTERVAL,
      }),
    ).toEqual({ action: 'skip', reason: 'quiet_hours' });
  });
});
