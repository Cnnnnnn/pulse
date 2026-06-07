/**
 * tests/main/tier.test.js
 *
 * Phase 29: tier 纯函数 + 推荐映射 + 排序.
 *
 * 覆盖:
 *   - getTier boundary: 6d=hot, 7d=warm, 30d=warm, 31d=cold
 *   - getTier null → unknown
 *   - getTier future time (lastMs > now) → unknown (clock skew defense)
 *   - recommendedMuteSeconds 4 个 tier 各自正确
 *   - rankMuteOptions:
 *     - hot: 1d 置顶 + recommended, 7d 30d 90d 升序, forever 最后
 *     - warm: 7d 置顶
 *     - cold: 30d 置顶
 *     - unknown: 7d 置顶
 *   - 永远 (forever, seconds=0) 永远在 last, 不变
 */

import { describe, it, expect } from 'vitest';
import {
  TIER,
  HOT_MAX_DAYS,
  WARM_MAX_DAYS,
  getTier,
  recommendedMuteSeconds,
  rankMuteOptions,
  BASE_OPTIONS,
} from '../../src/main/tier.js';

const NOW = 1750000000000;        // 2025-06-15 ish
const DAY = 24 * 3600 * 1000;

describe('getTier (Phase 29 pure fn)', () => {
  it('lastMs null → unknown', () => {
    expect(getTier(null, NOW)).toBe('unknown');
  });

  it('lastMs undefined → unknown', () => {
    expect(getTier(undefined, NOW)).toBe('unknown');
  });

  it('lastMs non-number → unknown', () => {
    expect(getTier('2025-01-01', NOW)).toBe('unknown');
    // numeric 123 = epoch 1970, that's "old" → cold, not unknown
    expect(getTier(123, NOW)).toBe('cold');
  });

  it('lastMs > now (clock skew / future) → unknown', () => {
    expect(getTier(NOW + 1000, NOW)).toBe('unknown');
  });

  it('hot: ≤ 7 天', () => {
    expect(getTier(NOW - 1 * DAY, NOW)).toBe('hot');
    expect(getTier(NOW - 6.9 * DAY, NOW)).toBe('hot');
  });

  it('warm: 7-30 天 (8d-30d, 7d 仍是 hot)', () => {
    // boundary: 7d 严格 ≤ 7 = hot
    expect(getTier(NOW - 7 * DAY, NOW)).toBe('hot');
    // 8d 起进入 warm
    expect(getTier(NOW - 8 * DAY, NOW)).toBe('warm');
    expect(getTier(NOW - 15 * DAY, NOW)).toBe('warm');
    // boundary: 30d 仍 ≤ 30 = warm
    expect(getTier(NOW - 30 * DAY, NOW)).toBe('warm');
  });

  it('cold: > 30 天', () => {
    expect(getTier(NOW - 31 * DAY, NOW)).toBe('cold');
    expect(getTier(NOW - 365 * DAY, NOW)).toBe('cold');
  });

  it('now 默认值 = Date.now() (不传 now 时也工作)', () => {
    // 用 lastMs = 0 → epoch (1970), 巨老, 必 cold
    expect(getTier(0)).toBe('cold');
  });
});

describe('recommendedMuteSeconds (Phase 29)', () => {
  it('hot → 1 天', () => {
    expect(recommendedMuteSeconds('hot')).toBe(86400);
  });

  it('warm → 7 天', () => {
    expect(recommendedMuteSeconds('warm')).toBe(7 * 86400);
  });

  it('cold → 30 天', () => {
    expect(recommendedMuteSeconds('cold')).toBe(30 * 86400);
  });

  it('unknown → 7 天 (跟 warm 一样)', () => {
    expect(recommendedMuteSeconds('unknown')).toBe(7 * 86400);
  });

  it('invalid tier → 默认 7 天 (跟 unknown 一样)', () => {
    expect(recommendedMuteSeconds('garbage')).toBe(7 * 86400);
  });
});

describe('rankMuteOptions (Phase 29)', () => {
  it('基础 5 选项结构', () => {
    expect(BASE_OPTIONS).toHaveLength(5);
    expect(BASE_OPTIONS.map((o) => o.seconds)).toEqual([86400, 604800, 2592000, 7776000, 0]);
  });

  it('hot tier: 1 天置顶 + recommended, 7/30/90 升序, 永远最后', () => {
    const r = rankMuteOptions('hot');
    expect(r.map((o) => o.seconds)).toEqual([
      1 * 86400, 7 * 86400, 30 * 86400, 90 * 86400, 0,
    ]);
    expect(r[0].recommended).toBe(true);
    expect(r.slice(1).map((o) => o.recommended)).toEqual([false, false, false, false]);
  });

  it('warm tier: 7 天置顶 + recommended', () => {
    const r = rankMuteOptions('warm');
    expect(r.map((o) => o.seconds)).toEqual([
      7 * 86400, 1 * 86400, 30 * 86400, 90 * 86400, 0,
    ]);
    expect(r[0].seconds).toBe(7 * 86400);
    expect(r[0].recommended).toBe(true);
    expect(r.find((o) => o.recommended)).toBe(r[0]);
  });

  it('cold tier: 30 天置顶 + recommended', () => {
    const r = rankMuteOptions('cold');
    expect(r.map((o) => o.seconds)).toEqual([
      30 * 86400, 1 * 86400, 7 * 86400, 90 * 86400, 0,
    ]);
    expect(r[0].seconds).toBe(30 * 86400);
    expect(r[0].recommended).toBe(true);
  });

  it('unknown tier: 7 天置顶 (跟 warm 一样)', () => {
    const r = rankMuteOptions('unknown');
    expect(r[0].seconds).toBe(7 * 86400);
    expect(r[0].recommended).toBe(true);
  });

  it('永远 (seconds=0) 永远在 last 位置, 不变', () => {
    for (const tier of ['hot', 'warm', 'cold', 'unknown']) {
      const r = rankMuteOptions(tier);
      const last = r[r.length - 1];
      expect(last.seconds).toBe(0);
      expect(last.label).toBe('永远');
    }
  });

  it('每个 tier 都恰好有 1 个 recommended', () => {
    for (const tier of ['hot', 'warm', 'cold', 'unknown']) {
      const r = rankMuteOptions(tier);
      const rec = r.filter((o) => o.recommended);
      expect(rec).toHaveLength(1);
    }
  });

  it('returned 数组不 mutate BASE_OPTIONS (纯函数)', () => {
    const before = JSON.stringify(BASE_OPTIONS);
    rankMuteOptions('hot');
    rankMuteOptions('cold');
    const after = JSON.stringify(BASE_OPTIONS);
    expect(after).toBe(before);
  });
});

describe('constants (Phase 29)', () => {
  it('HOT_MAX_DAYS = 7', () => {
    expect(HOT_MAX_DAYS).toBe(7);
  });

  it('WARM_MAX_DAYS = 30', () => {
    expect(WARM_MAX_DAYS).toBe(30);
  });

  it('TIER 是 frozen', () => {
    expect(Object.isFrozen(TIER)).toBe(true);
  });
});
