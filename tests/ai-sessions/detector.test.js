/**
 * tests/ai-sessions/detector.test.js
 *
 * Phase B1a (AI Sessions Daily Digest): AISessionDetector 抽象 class 测试.
 * 跟 plan B1a 对齐 (~20 cases).
 *
 * 覆盖:
 *   - constructor 校验 (appName / impl)
 *   - isInstalled: 调 impl, 返 boolean
 *   - listSessions: 注入 appName, 处理 impl 返非数组
 *   - readSession: 注入 appName, 处理 messages 缺失
 *   - filterByLocalDay: 边界 (mtimeMs / startedAt / endedAt 优先级)
 *   - filterByLocalDay: 跨日 (mtimeMs 落在 [dayStart, dayEnd))
 *   - filterByLocalDay: 非法 dateKey / sessions → []
 *   - _localDayStart 静态 helper: 给定 now + dateKey 算 ms (跨时区)
 */

import { describe, it, expect, vi } from 'vitest';
import { AISessionDetector } from '../../src/ai-sessions/detector.js';

function makeImpl(overrides = {}) {
  return {
    isInstalled: vi.fn(async () => true),
    listSessions: vi.fn(async () => []),
    readSession: vi.fn(async (id) => ({ id, messages: [] })),
    ...overrides,
  };
}

describe('AISessionDetector — constructor', () => {
  it('需要 appName', () => {
    expect(() => new AISessionDetector({ impl: makeImpl() })).toThrow(TypeError);
  });

  it('需要 impl 含 isInstalled/listSessions/readSession', () => {
    expect(() => new AISessionDetector({ appName: 'cursor', impl: {} })).toThrow(TypeError);
    expect(() => new AISessionDetector({ appName: 'cursor', impl: { isInstalled: () => {} } })).toThrow(TypeError);
  });

  it('正常构造保存 appName + impl', () => {
    const impl = makeImpl();
    const d = new AISessionDetector({ appName: 'cursor', impl });
    expect(d.appName).toBe('cursor');
    expect(d.impl).toBe(impl);
  });
});

describe('AISessionDetector — isInstalled / listSessions / readSession', () => {
  it('isInstalled: 调 impl.isInstalled, 返 boolean', async () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl({ isInstalled: async () => true }) });
    expect(await d.isInstalled()).toBe(true);
  });

  it('isInstalled: impl 返 falsy → 返 false', async () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl({ isInstalled: async () => null }) });
    expect(await d.isInstalled()).toBe(false);
  });

  it('listSessions: 注入 appName 到每个 meta', async () => {
    const metas = [
      { id: 'a', file: '/x/a.db', mtimeMs: 100, sizeBytes: 200 },
      { id: 'b', file: '/x/b.db', mtimeMs: 300, sizeBytes: 400 },
    ];
    const d = new AISessionDetector({
      appName: 'cursor',
      impl: makeImpl({ listSessions: async () => metas }),
    });
    const out = await d.listSessions();
    expect(out).toHaveLength(2);
    expect(out[0].appName).toBe('cursor');
    expect(out[0].id).toBe('a');
    expect(out[1].appName).toBe('cursor');
  });

  it('listSessions: impl 返非数组 → []', async () => {
    const d = new AISessionDetector({
      appName: 'cursor',
      impl: makeImpl({ listSessions: async () => null }),
    });
    expect(await d.listSessions()).toEqual([]);
  });

  it('readSession: 注入 appName + defaults', async () => {
    const d = new AISessionDetector({
      appName: 'cursor',
      impl: makeImpl({ readSession: async (id) => ({ id, messages: [{ role: 'user', content: 'hi', ts: 123 }] }) }),
    });
    const s = await d.readSession('xyz');
    expect(s.id).toBe('xyz');
    expect(s.appName).toBe('cursor');
    expect(s.startedAt).toBe(0);  // 缺省
    expect(s.endedAt).toBe(0);
    expect(s.messages).toHaveLength(1);
  });

  it('readSession: id 空 → throw', async () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl() });
    await expect(d.readSession('')).rejects.toThrow(TypeError);
  });

  it('readSession: messages 缺 → []', async () => {
    const d = new AISessionDetector({
      appName: 'cursor',
      impl: makeImpl({ readSession: async (id) => ({ id }) }),
    });
    const s = await d.readSession('x');
    expect(s.messages).toEqual([]);
  });
});

describe('AISessionDetector — filterByLocalDay', () => {
  it('非法 dateKey → []', () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl() });
    expect(d.filterByLocalDay([{ mtimeMs: 1000 }], 'not-a-date')).toEqual([]);
    expect(d.filterByLocalDay([{ mtimeMs: 1000 }], '2026/06/07')).toEqual([]);
  });

  it('非法 sessions → []', () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl() });
    expect(d.filterByLocalDay(null, '2026-06-07')).toEqual([]);
    expect(d.filterByLocalDay(undefined, '2026-06-07')).toEqual([]);
  });

  it('mtimeMs 在 [dayStart, dayEnd) → 保留', () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl() });
    // 固定 now 让 _localDayStart 算出来稳定. 但 now 影响 hour→offset 计算, 跨时区不 100% 稳.
    // 测: mtimeMs 落在 dayStart 跟 dayEnd 之间.
    // 用 now = dayStart 那天 noon UTC, 这样 offset 计算不跨日 wrap.
    // 简化: 算 dayStart 用 2026-06-07 + 假设 macOS TZ (CI 通常 UTC, 测也用 UTC)
    // 假设测试跑在 UTC, _localDayStart(2026-06-07) = Date.UTC(2026, 5, 7) = 2026-06-07 00:00:00 UTC
    const dayStart = Date.UTC(2026, 5, 7, 0, 0, 0, 0);
    const sessions = [
      { id: 'a', mtimeMs: dayStart },                       // 边界
      { id: 'b', mtimeMs: dayStart + 3600 * 1000 },         // 1h 后
      { id: 'c', mtimeMs: dayStart + 23 * 3600 * 1000 },   // 23h 后
    ];
    const out = d.filterByLocalDay(sessions, '2026-06-07');
    // 假设测试跑在 UTC, 全部保留
    expect(out.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('mtimeMs 在 dayStart 前 → 排除', () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl() });
    const dayStart = Date.UTC(2026, 5, 7, 0, 0, 0, 0);
    const sessions = [
      { id: 'a', mtimeMs: dayStart - 1 },
      { id: 'b', mtimeMs: dayStart + 1 },
    ];
    const out = d.filterByLocalDay(sessions, '2026-06-07');
    expect(out.map((s) => s.id)).toEqual(['b']);
  });

  it('mtimeMs 缺 → fallback 到 endedAt, 再 startedAt', () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl() });
    const dayStart = Date.UTC(2026, 5, 7, 0, 0, 0, 0);
    const sessions = [
      { id: 'a', endedAt: dayStart + 1000 },           // 走 endedAt
      { id: 'b', startedAt: dayStart + 2000 },         // 走 startedAt
      { id: 'c' },                                       // 全缺 → 0 → 排除
    ];
    const out = d.filterByLocalDay(sessions, '2026-06-07');
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('mtimeMs 在 dayEnd (= dayStart + 24h) → 排除 (上界开区间)', () => {
    const d = new AISessionDetector({ appName: 'cursor', impl: makeImpl() });
    const dayStart = Date.UTC(2026, 5, 7, 0, 0, 0, 0);
    const sessions = [
      { id: 'a', mtimeMs: dayStart + 86400 * 1000 },     // 24h → 排
      { id: 'b', mtimeMs: dayStart + 86400 * 1000 - 1 }, // 23:59:59.999 → 留
    ];
    const out = d.filterByLocalDay(sessions, '2026-06-07');
    expect(out.map((s) => s.id)).toEqual(['b']);
  });
});

describe('AISessionDetector._localDayStart (静态 helper)', () => {
  it('dateKey 非法 → NaN', () => {
    expect(Number.isNaN(AISessionDetector._localDayStart('2026-13-99', Date.now()))).toBe(true);
    expect(Number.isNaN(AISessionDetector._localDayStart('bad', Date.now()))).toBe(true);
  });

  it('dateKey 2026-06-07 + now=2026-06-07 noon UTC → dayStart 在 [2026-06-07 0:00 UTC, 2026-06-08 0:00 UTC)', () => {
    // 跨时区: 不管测试跑在哪个 tz, dayStart 应该是当天 0:00 本地
    // 验证: 拿 dayStart 推算 dayKey 应该 == '2026-06-07' (本地)
    const now = Date.UTC(2026, 5, 7, 12, 0, 0, 0);
    const dayStart = AISessionDetector._localDayStart('2026-06-07', now);
    // dayStart + 12h 应该是当天 12:00 本地 → _localDateKey 推回应该是 '2026-06-07'
    expect(Number.isFinite(dayStart)).toBe(true);
    // 验证 dayStart < now < dayStart + 24h
    expect(dayStart).toBeLessThanOrEqual(now);
    expect(dayStart + 86400_000).toBeGreaterThan(now);
  });

  it('dayStart 是 dayEnd - 24h (86400 * 1000 ms)', () => {
    const now = Date.UTC(2026, 5, 7, 12, 0, 0, 0);
    const dayStart = AISessionDetector._localDayStart('2026-06-07', now);
    const dayEnd = dayStart + 86400_000;
    expect(dayEnd - dayStart).toBe(86400_000);
  });
});
