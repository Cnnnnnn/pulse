/**
 * tests/renderer/weekly-stats.test.js
 *
 * Phase 19: 周报式摘要 computeWeeklyStats() 单测.
 */

import { describe, it, expect } from 'vitest';
import { computeWeeklyStats } from '../../src/renderer/weekly-stats.js';

const NOW = new Date('2026-06-06T12:00:00').getTime();
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

describe('computeWeeklyStats', () => {
  it('空 state → 0 升级', () => {
    const s = computeWeeklyStats({}, { now: NOW });
    expect(s.upgrades).toBe(0);
    expect(s.apps).toEqual([]);
    expect(s.totalChangelogChars).toBe(0);
    expect(s.oldest).toBeNull();
  });

  it('null/undefined state → 安全', () => {
    expect(computeWeeklyStats(null, { now: NOW }).upgrades).toBe(0);
    expect(computeWeeklyStats(undefined, { now: NOW }).upgrades).toBe(0);
  });

  it('state.apps undefined → 当成空', () => {
    expect(computeWeeklyStats({ apps: undefined }, { now: NOW }).upgrades).toBe(0);
  });

  it('7 天内 1 次升级', () => {
    const state = {
      apps: {
        Cursor: {
          changelog_history: [
            { version: '3.5', ts: NOW - 2 * DAY, changelog: 'old release' },
          ],
        },
      },
    };
    const s = computeWeeklyStats(state, { now: NOW });
    expect(s.upgrades).toBe(1);
    expect(s.apps).toEqual(['Cursor']);
    expect(s.totalChangelogChars).toBe('old release'.length);
    expect(s.oldest).toBe(NOW - 2 * DAY);
  });

  it('7 天外 (8 天前) → 不算升级', () => {
    const state = {
      apps: {
        Cursor: {
          changelog_history: [
            { version: '3.4', ts: NOW - 8 * DAY, changelog: 'very old' },
          ],
        },
      },
    };
    const s = computeWeeklyStats(state, { now: NOW });
    expect(s.upgrades).toBe(0);
  });

  it('窗口边界: 正好 7 天前 (cutoff) → 不算 (strict <)', () => {
    const state = {
      apps: {
        X: { changelog_history: [{ ts: NOW - WEEK, changelog: 'edge' }] },
      },
    };
    // cutoff = NOW - WEEK, so `ts < cutoff` is false, 不算
    expect(computeWeeklyStats(state, { now: NOW }).upgrades).toBe(0);
  });

  it('窗口边界: 7 天前 + 1ms → 算', () => {
    const state = {
      apps: {
        X: { changelog_history: [{ ts: NOW - WEEK + 1, changelog: 'edge' }] },
      },
    };
    expect(computeWeeklyStats(state, { now: NOW }).upgrades).toBe(1);
  });

  it('多个 app 多次升级 → apps 去重, upgrades 累加', () => {
    const state = {
      apps: {
        A: { changelog_history: [
          { ts: NOW - 1 * DAY, changelog: 'A v1' },
          { ts: NOW - 3 * DAY, changelog: 'A v2' },
        ]},
        B: { changelog_history: [
          { ts: NOW - 2 * DAY, changelog: 'B v1' },
        ]},
      },
    };
    const s = computeWeeklyStats(state, { now: NOW });
    expect(s.upgrades).toBe(3);
    expect(s.apps.sort()).toEqual(['A', 'B']);
    expect(s.oldest).toBe(NOW - 3 * DAY);
  });

  it('混合: 7 天内 + 7 天外 → 只算窗口内', () => {
    const state = {
      apps: {
        A: { changelog_history: [
          { ts: NOW - 1 * DAY, changelog: 'A recent' },
          { ts: NOW - 30 * DAY, changelog: 'A old' },
        ]},
      },
    };
    const s = computeWeeklyStats(state, { now: NOW });
    expect(s.upgrades).toBe(1);
    expect(s.totalChangelogChars).toBe('A recent'.length);
  });

  it('windowMs 自定义', () => {
    const state = {
      apps: {
        X: { changelog_history: [
          { ts: NOW - 6 * 60 * 60 * 1000, changelog: 'recent' },  // 6h ago
          { ts: NOW - 2 * DAY, changelog: 'old' },                  // 2d ago
        ]},
      },
    };
    // 1 天窗口: 6h 前的算, 2d 前的 OUTSIDE
    const s1d = computeWeeklyStats(state, { windowMs: 1 * DAY, now: NOW });
    expect(s1d.upgrades).toBe(1);
    expect(s1d.totalChangelogChars).toBe('recent'.length);
  });

  it('changelog 缺失 → 不计入 chars (但 ts 仍算升级)', () => {
    const state = {
      apps: {
        X: { changelog_history: [
          { ts: NOW - 1 * DAY },  // 没 changelog
        ]},
      },
    };
    const s = computeWeeklyStats(state, { now: NOW });
    expect(s.upgrades).toBe(1);
    expect(s.totalChangelogChars).toBe(0);
  });

  it('ts 缺失 → 该条不计', () => {
    const state = {
      apps: {
        X: { changelog_history: [
          { changelog: 'no ts' },  // 没 ts
        ]},
      },
    };
    expect(computeWeeklyStats(state, { now: NOW }).upgrades).toBe(0);
  });

  it('changelog_history 不是 array → 当成空', () => {
    const state = {
      apps: {
        X: { changelog_history: 'not array' },
        Y: { changelog_history: null },
        Z: {},
      },
    };
    expect(computeWeeklyStats(state, { now: NOW }).upgrades).toBe(0);
  });
});
