/**
 * tests/main/digest/daily-summary-job.test.js
 *
 * Phase I1+I5: scheduler fires notification at configured time, gated by
 * last_push_date (no same-day double push). Quiet hours + empty lines
 * are silent skips.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startDailySummaryJob, __resetForTest } from '../../../src/main/digest/daily-summary-job.js';

describe('daily-summary-job', () => {
  let deps;
  let state;
  let sentNotifications;

  beforeEach(() => {
    state = { daily_digest: { enabled: true, time: '08:30', last_push_date: null } };
    sentNotifications = [];
    deps = {
      getState: () => state,
      setState: (next) => {
        Object.assign(state, next);
        if (next.daily_digest) state.daily_digest = { ...state.daily_digest, ...next.daily_digest };
      },
      getConfig: () => ({ notifications: { quiet_hours_start: '23:00', quiet_hours_end: '08:00' } }),
      sendNotification: (n) => sentNotifications.push(n),
      aggregate: () => ({ date: '2026-06-20', sections: [{ kind: 'updates', items: [{ name: 'Cursor' }] }], lines: ['• Cursor 1 → 2'] }),
      now: () => new Date('2026-06-20T08:30:00'),
    };
    __resetForTest();
  });

  afterEach(() => {
    __resetForTest();
  });

  it('does not start when enabled=false', () => {
    state.daily_digest.enabled = false;
    const handle = startDailySummaryJob(deps);
    handle.triggerNow();
    expect(sentNotifications).toEqual([]);
    handle.stop();
  });

  it('fires notification at exact trigger time', () => {
    const handle = startDailySummaryJob(deps);
    handle.triggerNow();
    expect(sentNotifications).toHaveLength(1);
    expect(sentNotifications[0].title).toContain('早报');
    expect(sentNotifications[0].body).toContain('Cursor');
    handle.stop();
  });

  it('records last_push_date after successful push', () => {
    const handle = startDailySummaryJob(deps);
    handle.triggerNow();
    expect(state.daily_digest.last_push_date).toBe('2026-06-20');
    handle.stop();
  });

  it('skips push if last_push_date === today (no same-day double push)', () => {
    state.daily_digest.last_push_date = '2026-06-20';
    const handle = startDailySummaryJob(deps);
    handle.triggerNow();
    expect(sentNotifications).toEqual([]);
    handle.stop();
  });

  it('skips push in quiet hours', () => {
    state.daily_digest.time = '07:30';
    deps.now = () => new Date('2026-06-20T07:30:00');
    const handle = startDailySummaryJob(deps);
    handle.triggerNow();
    expect(sentNotifications).toEqual([]);
    handle.stop();
  });

  it('silently skips when aggregate.lines is empty', () => {
    deps.aggregate = () => ({ date: '2026-06-20', sections: [], lines: [] });
    const handle = startDailySummaryJob(deps);
    handle.triggerNow();
    expect(sentNotifications).toEqual([]);
    handle.stop();
  });

  it('does NOT update last_push_date when push is skipped (silent)', () => {
    deps.aggregate = () => ({ date: '2026-06-20', sections: [], lines: [] });
    const handle = startDailySummaryJob(deps);
    handle.triggerNow();
    expect(state.daily_digest.last_push_date).toBeNull();
    handle.stop();
  });

  it('falls back to 08:30 when time field is malformed', () => {
    state.daily_digest.time = 'not-a-time';
    deps.now = () => new Date('2026-06-20T08:30:00');
    const handle = startDailySummaryJob(deps);
    handle.triggerNow();
    expect(sentNotifications).toHaveLength(1);
    handle.stop();
  });
});
