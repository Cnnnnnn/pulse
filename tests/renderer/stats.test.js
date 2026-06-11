/**
 * tests/renderer/stats.test.js
 *
 * v2.8.1 (F1 Stats 自我统计): 4 段纯函数单测.
 *
 * 形态跟 tests/renderer/weekly-stats.test.js 一致 — 不重复 weekly-stats 已覆盖.
 */

import { describe, it, expect } from 'vitest';
import {
  computeCounters,
  computeSourceBreakdown,
  computeUpgradeHistory,
  computeMuteStats,
} from '../../src/renderer/stats.js';

const NOW = new Date('2026-06-06T12:00:00').getTime();
const DAY = 24 * 60 * 60 * 1000;

// ─── S1: computeCounters ────────────────────────────

describe('computeCounters (S1)', () => {
  it('空 state + 空 libraryConfig → 全 0', () => {
    const c = computeCounters({}, {});
    expect(c).toEqual({
      total: 0, updatable: 0, weekUpgrades: 0, pinned: 0, ignored: 0,
    });
  });

  it('null state + null libraryConfig → 安全', () => {
    expect(computeCounters(null, null).total).toBe(0);
    expect(computeCounters(undefined, undefined).updatable).toBe(0);
  });

  it('11 app + 3 has_update + 2 pinned + 1 ignored → 正确计数', () => {
    const apps = {};
    for (let i = 0; i < 11; i += 1) {
      apps[`App${i}`] = { status: i < 3 ? 'has_update' : 'up_to_date' };
    }
    const libCfg = { pinned: ['App0', 'App1', 'App2'], ignored: [{ appName: 'App3' }] };
    const c = computeCounters({ apps }, libCfg);
    expect(c.total).toBe(11);
    expect(c.updatable).toBe(3);
    expect(c.pinned).toBe(3);
    expect(c.ignored).toBe(1);
    // weekUpgrades 走 computeWeeklyStats, 0 (没 changelog_history)
    expect(c.weekUpgrades).toBe(0);
  });

  it('updatable 标 is correct: 只数 status === "has_update"', () => {
    const apps = {
      A: { status: 'has_update' },
      B: { status: 'up_to_date' },
      C: { status: 'error' },
      D: { status: 'has_update' },
    };
    expect(computeCounters({ apps }, {}).updatable).toBe(2);
  });
});

// ─── S2: computeSourceBreakdown ──────────────────────

describe('computeSourceBreakdown (S2)', () => {
  it('空 state → 空数组', () => {
    expect(computeSourceBreakdown({})).toEqual([]);
  });

  it('按 count desc 排序 + 同 count 字母序', () => {
    const apps = {
      Cursor: { source: 'brew_formulae' },
      VSCode: { source: 'electron_yml' },
      Kimi:  { source: 'electron_yml' },
      MiniMax: { source: 'electron_yml' },
      Codex: { source: 'sparkle_appcast' },
      Slack: { source: 'sparkle_appcast' },
    };
    const r = computeSourceBreakdown({ apps });
    expect(r).toEqual([
      { source: 'electron_yml', count: 3 },
      { source: 'sparkle_appcast', count: 2 },
      { source: 'brew_formulae', count: 1 },
    ]);
  });

  it('app 没 source → 归到 "unknown"', () => {
    const apps = { A: {}, B: { source: 'brew_formulae' } };
    const r = computeSourceBreakdown({ apps });
    const unknown = r.find((x) => x.source === 'unknown');
    expect(unknown.count).toBe(1);
  });
});

// ─── S3: computeUpgradeHistory ───────────────────────

describe('computeUpgradeHistory (S3)', () => {
  it('空 state → 三档全 0 升级', () => {
    const h = computeUpgradeHistory({}, { now: NOW });
    expect(h).toHaveLength(3);
    expect(h.map((x) => x.windowDays)).toEqual([7, 30, 90]);
    expect(h.every((x) => x.upgrades === 0)).toBe(true);
  });

  it('3 天前 1 次升级 → 7d / 30d / 90d 都有, 7d 边界外 7d 漏掉', () => {
    const state = {
      apps: {
        Cursor: {
          changelog_history: [{ ts: NOW - 3 * DAY, changelog: 'fix' }],
        },
      },
    };
    const h = computeUpgradeHistory(state, { now: NOW });
    expect(h.find((x) => x.windowDays === 7).upgrades).toBe(1);
    expect(h.find((x) => x.windowDays === 30).upgrades).toBe(1);
    expect(h.find((x) => x.windowDays === 90).upgrades).toBe(1);
  });

  it('100 天前 1 次升级 → 三档都漏 (90d 窗口外)', () => {
    const state = {
      apps: {
        Cursor: { changelog_history: [{ ts: NOW - 100 * DAY, changelog: 'fix' }] },
      },
    };
    const h = computeUpgradeHistory(state, { now: NOW });
    expect(h.find((x) => x.windowDays === 7).upgrades).toBe(0);
    expect(h.find((x) => x.windowDays === 30).upgrades).toBe(0);
    // weekly-stats 用严格 <= 边界: 100d 前的 ts 比 90d cutoff 还早 10d, 不计入 90d
    expect(h.find((x) => x.windowDays === 90).upgrades).toBe(0);
  });

  it('边界: 89d 前的升级在 90d 窗口内, 在 30d 窗口外', () => {
    const state = {
      apps: {
        Cursor: { changelog_history: [{ ts: NOW - 89 * DAY, changelog: 'fix' }] },
      },
    };
    const h = computeUpgradeHistory(state, { now: NOW });
    expect(h.find((x) => x.windowDays === 7).upgrades).toBe(0);
    expect(h.find((x) => x.windowDays === 30).upgrades).toBe(0);
    expect(h.find((x) => x.windowDays === 90).upgrades).toBe(1);
  });

  it('自定义 windowDays → 用传入的', () => {
    const h = computeUpgradeHistory({}, { windowDays: [1, 14], now: NOW });
    expect(h.map((x) => x.windowDays)).toEqual([1, 14]);
  });
});

// ─── S4: computeMuteStats ────────────────────────────

describe('computeMuteStats (S4)', () => {
  it('空 mutes → 全 0', () => {
    expect(computeMuteStats({})).toEqual({
      active: 0, permanent: 0, expired: 0, total: 0, list: [],
    });
  });

  it('区分 active / permanent / expired', () => {
    const state = {
      mutes: {
        A: { until: NOW + DAY, reason: 'manual' },         // active
        B: { until: 0, reason: 'manual' },                 // permanent
        C: { until: NOW - DAY, reason: 'manual' },         // expired
        D: { until: NOW + 7 * DAY, reason: 'cooldown' },  // active
      },
    };
    const r = computeMuteStats(state, { now: NOW });
    expect(r.active).toBe(3);    // A, B (permanent 算 active), D
    expect(r.permanent).toBe(1); // B
    expect(r.expired).toBe(1);   // C
    expect(r.total).toBe(4);
    expect(r.list.find((x) => x.name === 'A').state).toBe('active');
    expect(r.list.find((x) => x.name === 'B').state).toBe('permanent');
    expect(r.list.find((x) => x.name === 'C').state).toBe('expired');
  });

  it('边界: until === now → expired (不严格 >)', () => {
    const r = computeMuteStats({ mutes: { A: { until: NOW, reason: '' } } }, { now: NOW });
    expect(r.expired).toBe(1);
    expect(r.active).toBe(0);
  });
});
