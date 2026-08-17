import { describe, it, expect } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  validateState,
  isStateValid,
  migrateState,
  STATE_SCHEMA_VERSION,
} = requireMain('state-store-schema');
describe('state-store-schema', () => {
  it('exports the same schema version as state-store (1)', () => {
    expect(STATE_SCHEMA_VERSION).toBe(1);
  });

  it('accepts a minimal valid state', () => {
    const r = validateState({ v: 1, ts: 0, apps: {} });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(isStateValid({ v: 1, ts: 0, apps: {} })).toBe(true);
  });

  it('migrates an unversioned legacy state to the current v1 envelope', () => {
    const result = migrateState({
      apps: { Cursor: { name: 'Cursor' } },
      futureField: { keep: true },
    });

    expect(result).toMatchObject({
      migrated: true,
      fromVersion: 0,
      toVersion: STATE_SCHEMA_VERSION,
    });
    expect(result.state).toMatchObject({
      v: 1,
      ts: 0,
      mutes: {},
      last_opened: {},
      active_category: 'all',
      futureField: { keep: true },
    });
    expect(isStateValid(result.state)).toBe(true);
  });

  it('does not rewrite an already current v1 state', () => {
    const state = { v: 1, ts: 10, apps: {}, mutes: {} };
    expect(migrateState(state)).toMatchObject({
      migrated: false,
      fromVersion: 1,
      toVersion: STATE_SCHEMA_VERSION,
      state,
    });
  });

  it('rejects null / non-object', () => {
    expect(isStateValid(null)).toBe(false);
    expect(isStateValid(undefined)).toBe(false);
    expect(isStateValid('string')).toBe(false);
    expect(isStateValid(42)).toBe(false);
  });

  it('rejects when v is missing or wrong type', () => {
    const r1 = validateState({ ts: 0, apps: {} });
    expect(r1.ok).toBe(false);
    expect(r1.errors.some((e) => e.includes('v'))).toBe(true);

    const r2 = validateState({ v: '1', ts: 0, apps: {} });
    expect(r2.ok).toBe(false);
  });

  it('rejects when apps is missing or not an object', () => {
    expect(isStateValid({ v: 1, ts: 0 })).toBe(false);
    expect(isStateValid({ v: 1, ts: 0, apps: 'nope' })).toBe(false);
    expect(isStateValid({ v: 1, ts: 0, apps: [] })).toBe(false);
  });

  it('accepts unknown top-level fields (forward compat)', () => {
    const s = { v: 1, ts: 0, apps: {}, futureField: { anything: 1 } };
    expect(isStateValid(s)).toBe(true);
  });

  it('rejects when optional known fields have wrong types', () => {
    expect(isStateValid({ v: 1, ts: 0, apps: {}, mutes: 'bad' })).toBe(false);
    expect(isStateValid({ v: 1, ts: 0, apps: {}, mutes: [] })).toBe(false);
    expect(isStateValid({ v: 1, ts: 0, apps: {}, recentActivity: 'bad' })).toBe(false);
    // reminders must be array
    expect(isStateValid({ v: 1, ts: 0, apps: {}, reminders: {} })).toBe(false);
  });

  it('accepts valid optional fields of correct types', () => {
    const s = {
      v: 1, ts: 0, apps: {},
      mutes: { Cursor: { until: 0 } },
      last_opened: { Cursor: { ms: 1234 } },
      active_category: 'ai',
      reminders: [],
      recentActivity: [],
      circuitBreakers: { 'api_json:http://x': { state: 'open' } },
    };
    expect(isStateValid(s)).toBe(true);
  });

  it('accepts valid daily_digest field of correct type', () => {
    const s = {
      v: 1, ts: 0, apps: {},
      daily_digest: { enabled: true, time: '08:30', last_push_date: '2026-06-20' },
    };
    expect(isStateValid(s)).toBe(true);
  });

  it('rejects daily_digest with wrong type', () => {
    expect(isStateValid({ v: 1, ts: 0, apps: {}, daily_digest: 'bad' })).toBe(false);
    expect(isStateValid({ v: 1, ts: 0, apps: {}, daily_digest: [] })).toBe(false);
  });

  it('validates persisted domain fields that are part of the state-store preserve set', () => {
    const valid = {
      v: 1, ts: 0, apps: {},
      ai_usage_alert_prefs: {},
      tray_menu_prefs: {},
      startup_samples: [],
      watchlist: [],
      last_seen_release: {},
      wechat_hot: {},
      ai_prompts: {},
      upgrade_advice_cache: {},
      changelog_summary_cache: {},
      aiFeedback: [],
      tokenSpend: {},
      tokenBudgetConfig: {},
      stockScreener: {},
      aiStockAdviseCache: {},
      stockDetailCache: {},
      overviewCache: {},
      metals: {},
    };
    expect(isStateValid(valid)).toBe(true);

    const invalidCases = [
      ['ai_usage_alert_prefs', []],
      ['startup_samples', {}],
      ['watchlist', {}],
      ['last_seen_release', []],
      ['wechat_hot', []],
      ['ai_prompts', []],
      ['upgrade_advice_cache', []],
      ['changelog_summary_cache', []],
      ['aiFeedback', {}],
      ['tokenSpend', []],
      ['tokenBudgetConfig', []],
      ['stockScreener', []],
      ['aiStockAdviseCache', []],
      ['stockDetailCache', []],
      ['overviewCache', []],
      ['metals', []],
    ] as const;

    for (const [field, value] of invalidCases) {
      expect(isStateValid({ v: 1, ts: 0, apps: {}, [field]: value })).toBe(false);
    }
  });

  it('accepts app entries with snoozeUntil + skippedVersion sub-fields', () => {
    const s = {
      v: 1, ts: 0, apps: {
        Cursor: {
          name: 'Cursor',
          installed_version: '3.6.32',
          latest_version: '3.6.33',
          has_update: true,
          snoozeUntil: 1750513200000,
          skippedVersion: '3.6.33',
        },
      },
    };
    expect(isStateValid(s)).toBe(true);
  });
});
