/**
 * tests/ai-sessions/digest.test.js
 *
 * Phase B4 (AI Sessions Daily Digest): DailyDigestRunner 编排 + 边界.
 *
 * 覆盖 (~10 cases):
 *   - runOne: 0 sessions → null
 *   - runOne: 有 sessions → digest saved
 *   - runOne: idempotent (hasDigest 返 true → skip)
 *   - runOne: force=true 覆盖
 *   - runOne: detector.isInstalled 返 false → skip detector
 *   - runOne: readSession throw → 跳过该 session
 *   - runOne: filterByLocalDay 0 匹配 → null
 *   - runBackfill: 串行 N 天 + onProgress 回调
 *   - bootstrap: disabled → skip
 *   - bootstrap: enabled + 没 digest → 跑昨天 + backfill
 *   - start: setInterval 注册 + clearInterval
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DailyDigestRunner } from '../../src/ai-sessions/digest.js';

function makeFakeDetector({ appName = 'cursor', installed = true, sessions = [], readSessionImpl } = {}) {
  return {
    appName,
    isInstalled: vi.fn(async () => installed),
    listSessions: vi.fn(async () => sessions),
    readSession: readSessionImpl || vi.fn(async (id) => ({
      id,
      startedAt: 1000,
      endedAt: 2000,
      messages: [
        { role: 'user', content: `q-${id}`, ts: 1500 },
        { role: 'assistant', content: `a-${id}`, ts: 1800 },
      ],
    })),
    filterByLocalDay: vi.fn((arr, dateKey, now) => arr),  // 默认全过
  };
}

function makeFakeSummarizer({ summary = '# fake summary' } = {}) {
  return {
    provider: 'ollama',
    model: 'qwen3.5:9b',
    summarize: vi.fn(async () => summary),
    healthcheck: vi.fn(async () => ({ ok: true })),
  };
}

function makeFakeStorage(initialDigests = {}) {
  const digests = { ...initialDigests };
  return {
    digests,
    loadDigests: vi.fn(() => ({ ...digests })),
    hasDigest: vi.fn((dateKey) => Boolean(digests[dateKey])),
    saveDigest: vi.fn((d) => { digests[d.dateKey] = d; }),
  };
}

describe('DailyDigestRunner — runOne', () => {
  it('0 sessions → null (no save)', async () => {
    const detector = makeFakeDetector({ sessions: [] });
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage();
    const log = { info: () => {}, warn: () => {}, error: () => {} };
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log });
    const out = await r.runOne('2026-06-07');
    expect(out).toBeNull();
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(storage.saveDigest).not.toHaveBeenCalled();
  });

  it('有 sessions → digest saved + summarize 调 1 次', async () => {
    const detector = makeFakeDetector({
      sessions: [{ id: 'h1' }, { id: 'h2' }],
    });
    const summarizer = makeFakeSummarizer({ summary: '# daily' });
    const storage = makeFakeStorage();
    const log = { info: () => {}, warn: () => {}, error: () => {} };
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log });
    const out = await r.runOne('2026-06-07');
    expect(out).toMatchObject({
      dateKey: '2026-06-07',
      provider: 'ollama',
      model: 'qwen3.5:9b',
      sessionCount: 2,
      summary: '# daily',
      sessionIds: ['h1', 'h2'],
    });
    expect(summarizer.summarize).toHaveBeenCalledOnce();
    expect(storage.saveDigest).toHaveBeenCalledOnce();
    expect(storage.digests['2026-06-07']).toBeDefined();
  });

  it('idempotent: hasDigest 返 true → skip (no summarize)', async () => {
    const existing = { dateKey: '2026-06-07', summary: 'old' };
    const detector = makeFakeDetector({ sessions: [{ id: 'h1' }] });
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage({ '2026-06-07': existing });
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log: { info() {}, warn() {}, error() {} } });
    const out = await r.runOne('2026-06-07');
    expect(out).toBeNull();
    expect(summarizer.summarize).not.toHaveBeenCalled();
  });

  it('force=true → 覆盖现有 digest', async () => {
    const existing = { dateKey: '2026-06-07', summary: 'old' };
    const detector = makeFakeDetector({ sessions: [{ id: 'h1' }] });
    const summarizer = makeFakeSummarizer({ summary: 'new' });
    const storage = makeFakeStorage({ '2026-06-07': existing });
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log: { info() {}, warn() {}, error() {} } });
    const out = await r.runOne('2026-06-07', { force: true });
    expect(out).toMatchObject({ summary: 'new' });
    expect(storage.digests['2026-06-07'].summary).toBe('new');
  });

  it('detector.isInstalled=false → skip 该 detector (不 throw)', async () => {
    const detector = makeFakeDetector({ installed: false, sessions: [{ id: 'h1' }] });
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage();
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log: { info() {}, warn() {}, error() {} } });
    const out = await r.runOne('2026-06-07');
    expect(out).toBeNull();
    expect(detector.listSessions).not.toHaveBeenCalled();
  });

  it('readSession throw → 跳过该 session, 不 throw', async () => {
    const warn = vi.fn();
    const detector = makeFakeDetector({
      sessions: [{ id: 'good' }, { id: 'bad' }],
      readSessionImpl: vi.fn(async (id) => {
        if (id === 'bad') throw new Error('EIO');
        return { id, startedAt: 1, endedAt: 2, messages: [{ role: 'user', content: 'q', ts: 1 }] };
      }),
    });
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage();
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log: { info: () => {}, warn, error: () => {} } });
    const out = await r.runOne('2026-06-07');
    expect(out.sessionCount).toBe(1);
    expect(out.sessionIds).toEqual(['good']);
    expect(warn).toHaveBeenCalled();
  });

  it('filterByLocalDay 0 匹配 → null', async () => {
    const detector = makeFakeDetector({
      sessions: [{ id: 'h1' }],
      // 强制 filter 返 []
    });
    detector.filterByLocalDay = vi.fn(() => []);
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage();
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log: { info() {}, warn() {}, error() {} } });
    const out = await r.runOne('2026-06-07');
    expect(out).toBeNull();
  });

  it('非法 dateKey → throw TypeError', async () => {
    const r = new DailyDigestRunner({ detectors: [], summarizer: makeFakeSummarizer(), storage: makeFakeStorage(), log: { info() {}, warn() {}, error() {} } });
    await expect(r.runOne('bad')).rejects.toThrow(TypeError);
    await expect(r.runOne('2026/06/07')).rejects.toThrow(TypeError);
  });
});

describe('DailyDigestRunner — runBackfill', () => {
  it('串行 N 天 + onProgress(done, total) 调 N 次', async () => {
    const detector = makeFakeDetector({ sessions: [] });  // 0 sessions → 每 runOne null → 串行快
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage();
    // backfillSleepMs=0 跳过间隔 sleep, 测试快
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log: { info() {}, warn() {}, error() {} }, backfillSleepMs: 0 });
    const onProgress = vi.fn();
    const result = await r.runBackfill(3, { onProgress });
    expect(result.done).toBe(3);
    expect(result.total).toBe(3);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });

  it('days 缺省 = 7', async () => {
    const detector = makeFakeDetector({ sessions: [] });
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage();
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true }, log: { info() {}, warn() {}, error() {} }, backfillSleepMs: 0 });
    const onProgress = vi.fn();
    const result = await r.runBackfill(undefined, { onProgress });
    expect(result.total).toBe(7);
    expect(onProgress).toHaveBeenCalledTimes(7);
  });
});

describe('DailyDigestRunner — bootstrap', () => {
  it('config.enabled=false → skip, 不调 runner', async () => {
    const detector = makeFakeDetector({ sessions: [{ id: 'h1' }] });
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage();
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: false }, log: { info() {}, warn() {}, error() {} }, backfillSleepMs: 0 });
    const result = await r.bootstrap();
    expect(result).toEqual({ yesterday: null, backfill: null });
    expect(summarizer.summarize).not.toHaveBeenCalled();
  });

  it('config.enabled=true + 0 digests → 跑昨天 + 跑 backfill', async () => {
    const detector = makeFakeDetector({ sessions: [] });
    const summarizer = makeFakeSummarizer();
    const storage = makeFakeStorage();  // 空
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true, backfillDays: 3 }, log: { info() {}, warn() {}, error() {} }, backfillSleepMs: 0 });
    const result = await r.bootstrap();
    // 0 sessions → summarize 不会被调 → yesterday 返 null
    expect(result.yesterday).toBeNull();
    // backfill 跑了 (没 digests 也跑) → 返 { done, total, results }, results=[]
    expect(result.backfill).toBeDefined();
    expect(result.backfill.total).toBe(3);
    expect(result.backfill.results).toEqual([]);
  });

  it('config.enabled=true + 已有 1 个 digest → 跑昨天 (idempotent) + skip backfill', async () => {
    const yesterdayKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400_000));
    const storage = makeFakeStorage({ [yesterdayKey]: { dateKey: yesterdayKey, summary: 'old' } });
    const detector = makeFakeDetector({ sessions: [] });
    const summarizer = makeFakeSummarizer();
    const r = new DailyDigestRunner({ detectors: [detector], summarizer, storage, config: { enabled: true, backfillDays: 7 }, log: { info() {}, warn() {}, error() {} }, backfillSleepMs: 0 });
    const result = await r.bootstrap();
    // 已有 1 digest → 不跑 backfill
    expect(result.backfill).toBeNull();
  });
});

describe('DailyDigestRunner — start/stop', () => {
  it('start 注册 setInterval, stop clear', () => {
    const r = new DailyDigestRunner({ detectors: [], summarizer: makeFakeSummarizer(), storage: makeFakeStorage(), config: { enabled: true }, log: { info() {}, warn() {}, error() {} } });
    const handle = r.start(60_000);
    expect(typeof handle).toBe('object');  // NodeJS.Timeout
    r.stop();
    expect(r._intervalHandle).toBeNull();
  });

  it('start 多次 idempotent (返同 handle, 第二次 noop)', () => {
    const r = new DailyDigestRunner({ detectors: [], summarizer: makeFakeSummarizer(), storage: makeFakeStorage(), config: { enabled: true }, log: { info() {}, warn() {}, error() {} } });
    const h1 = r.start(60_000);
    const h2 = r.start(60_000);
    expect(h1).toBe(h2);
    r.stop();
  });

  it('stop idempotent (重复 noop)', () => {
    const r = new DailyDigestRunner({ detectors: [], summarizer: makeFakeSummarizer(), storage: makeFakeStorage(), config: { enabled: true }, log: { info() {}, warn() {}, error() {} } });
    r.start(60_000);
    r.stop();
    expect(() => r.stop()).not.toThrow();
  });
});
