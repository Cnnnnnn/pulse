/**
 * tests/main/snooze.test.js
 *
 * Phase C2: pure snooze helper.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  presetTime,
  isAppSnoozed,
  applySnoozeFilter,
} = require('../../src/main/snooze.js');

const AFTERNOON = new Date('2026-06-20T15:00:00').getTime();
const LATE_NIGHT = new Date('2026-06-20T23:30:00').getTime();
const SATURDAY = new Date('2026-06-20T10:00:00').getTime();
const WEDNESDAY = new Date('2026-06-17T15:00:00').getTime();

describe('presetTime', () => {
  it('tonight returns today 22:00 when called in afternoon', () => {
    const t = presetTime('tonight', AFTERNOON);
    const d = new Date(t);
    expect(d.getHours()).toBe(22);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(20);
  });

  it('tonight rolls to tomorrow 22:00 when called after 22:00', () => {
    const t = presetTime('tonight', LATE_NIGHT);
    const d = new Date(t);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(22);
  });

  it('tomorrow returns tomorrow 9:00', () => {
    const t = presetTime('tomorrow', AFTERNOON);
    const d = new Date(t);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(9);
  });

  it('weekend from Wednesday returns Saturday 10:00', () => {
    const t = presetTime('weekend', WEDNESDAY);
    const d = new Date(t);
    expect(d.getDay()).toBe(6);
    expect(d.getHours()).toBe(10);
    expect(d.getDate()).toBe(20);
  });

  it('weekend from Saturday returns next Saturday 10:00', () => {
    const t = presetTime('weekend', SATURDAY);
    const d = new Date(t);
    expect(d.getDay()).toBe(6);
    expect(d.getDate()).toBe(27);
  });

  it('skip-version returns null', () => {
    expect(presetTime('skip-version')).toBe(null);
  });

  it('returns null for unknown preset', () => {
    expect(presetTime('bogus')).toBe(null);
  });
});

describe('isAppSnoozed', () => {
  it('returns false when state has no app entry', () => {
    expect(isAppSnoozed({}, 'Cursor', AFTERNOON)).toBe(false);
  });

  it('returns true when snoozeUntil is in the future', () => {
    const state = { apps: { Cursor: { snoozeUntil: AFTERNOON + 86400_000 } } };
    expect(isAppSnoozed(state, 'Cursor', AFTERNOON)).toBe(true);
  });

  it('returns false when snoozeUntil is in the past', () => {
    const state = { apps: { Cursor: { snoozeUntil: AFTERNOON - 1 } } };
    expect(isAppSnoozed(state, 'Cursor', AFTERNOON)).toBe(false);
  });

  it('returns true when skippedVersion matches latest_version', () => {
    const state = { apps: { Cursor: { skippedVersion: '3.6.33' } } };
    const r = { name: 'Cursor', latest_version: '3.6.33' };
    expect(isAppSnoozed(state, 'Cursor', AFTERNOON, r)).toBe(true);
  });

  it('returns false when skippedVersion differs from latest_version', () => {
    const state = { apps: { Cursor: { skippedVersion: '3.6.32' } } };
    const r = { name: 'Cursor', latest_version: '3.6.33' };
    expect(isAppSnoozed(state, 'Cursor', AFTERNOON, r)).toBe(false);
  });
});

describe('applySnoozeFilter', () => {
  it('suppresses has_update for snoozed apps but preserves latest_version', () => {
    const state = {
      apps: { Cursor: { snoozeUntil: AFTERNOON + 86400_000 } },
    };
    const results = [
      { name: 'Cursor', has_update: true, latest_version: '3.6.33', installed_version: '3.6.32' },
    ];
    const out = applySnoozeFilter(results, state, AFTERNOON);
    expect(out[0].has_update).toBe(false);
    expect(out[0].latest_version).toBe('3.6.33');
    expect(out[0].snoozed).toBe(true);
    expect(out[0].snoozeReason).toBe('until');
  });

  it('does not affect non-snoozed apps', () => {
    const state = { apps: {} };
    const results = [
      { name: 'Cursor', has_update: true, latest_version: '3.6.33' },
    ];
    const out = applySnoozeFilter(results, state, AFTERNOON);
    expect(out[0].has_update).toBe(true);
    expect(out[0].snoozed).toBeFalsy();
  });

  it('handles mix of snoozed and non-snoozed', () => {
    const state = {
      apps: { Cursor: { snoozeUntil: AFTERNOON + 86400_000 } },
    };
    const results = [
      { name: 'Cursor', has_update: true, latest_version: '3.6.33' },
      { name: 'Slack', has_update: true, latest_version: '5.0.0' },
    ];
    const out = applySnoozeFilter(results, state, AFTERNOON);
    expect(out[0].snoozed).toBe(true);
    expect(out[1].snoozed).toBeFalsy();
    expect(out[1].has_update).toBe(true);
  });

  it('preserves result when latest_version is missing (no false snooze)', () => {
    const state = {
      apps: { Cursor: { skippedVersion: '3.6.33' } },
    };
    const results = [
      { name: 'Cursor', has_update: false },
    ];
    const out = applySnoozeFilter(results, state, AFTERNOON);
    expect(out[0].has_update).toBe(false);
    expect(out[0].snoozed).toBeFalsy();
  });
});
