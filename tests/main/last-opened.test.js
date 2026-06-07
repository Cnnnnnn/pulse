/**
 * tests/main/last-opened.test.js
 *
 * Phase 29: last-opened.js 数据源 + 缓存.
 *
 * 覆盖:
 *   - mdls hit → spotlight
 *   - mdls returns "(null)" → fallback to atime
 *   - mdls throws → fallback to atime
 *   - mdls timeout → fallback to atime
 *   - atime hit → atime
 *   - both fail → unknown
 *   - bundlePath null → unknown
 *   - cache: hit within TTL (no 2nd exec call)
 *   - cache: expires after TTL, refreshes
 *   - refreshOne: forces skipCache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLastOpened,
  refreshOne,
  clearCache,
  CACHE_TTL_MS,
  _cache,
} from '../../src/main/last-opened.js';

const FAKE_NOW = 1750000000000;
const FAKE_DAY = 24 * 3600 * 1000;

beforeEach(() => {
  clearCache();
});

/**
 * Mock factory: build a fake execFile that returns scripted responses
 * in order, one per call. Each item is { cmd, args, out, err }.
 */
function makeExecFileMock(scripts) {
  const calls = [];
  let i = 0;
  const exec = (cmd, args, opts, cb) => {
    calls.push({ cmd, args, opts });
    const next = scripts[i++];
    if (!next) {
      // No more scripted responses — fail
      return cb(new Error(`unexpected exec call #${i}: ${cmd} ${args.join(' ')}`));
    }
    if (next.err) {
      return cb(next.err, next.out || '');
    }
    return cb(null, next.out || '');
  };
  return { exec, calls };
}

describe('getLastOpened (Phase 29)', () => {
  describe('mdls path', () => {
    it('mdls hit → source=spotlight, ms parsed', async () => {
      const { exec } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = 2026-06-07 10:08:39 +0000\n' },
      ]);
      const r = await getLastOpened('/Applications/Cursor.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('spotlight');
      expect(r.ms).toBe(Date.parse('2026-06-07 10:08:39 +0000'));
    });

    it('mdls returns "(null)" → fallback to atime', async () => {
      const { exec } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = (null)\n' },
        { out: '1780599092\n' },
      ]);
      const r = await getLastOpened('/Applications/Kimi.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('atime');
      expect(r.ms).toBe(1780599092 * 1000);
    });

    it('mdls throws → fallback to atime', async () => {
      const { exec } = makeExecFileMock([
        { err: new Error('mdls: bundle not found') },
        { out: '1780599092\n' },
      ]);
      const r = await getLastOpened('/Applications/Missing.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('atime');
      expect(r.ms).toBe(1780599092 * 1000);
    });

    it('mdls timeout (silent — child emits no error but execFile times out) → fallback to atime', async () => {
      // Real child_process.execFile with timeout option emits Error('SIGTERM') or similar.
      // Our mock returns err to simulate.
      const { exec } = makeExecFileMock([
        { err: Object.assign(new Error('Command failed: mdls'), { killed: true, signal: 'SIGTERM' }) },
        { out: '1780599092\n' },
      ]);
      const r = await getLastOpened('/Applications/Kimi.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('atime');
    });

    it('mdls returns garbage (not date) → fallback to atime', async () => {
      const { exec } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = Not a date\n' },
        { out: '1780599092\n' },
      ]);
      const r = await getLastOpened('/Applications/X.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('atime');
    });
  });

  describe('atime path', () => {
    it('atime hit → source=atime', async () => {
      const { exec } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = (null)\n' },  // mdls returns null
        { out: '1700000000\n' },                     // stat returns epoch sec
      ]);
      const r = await getLastOpened('/Applications/X.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('atime');
      expect(r.ms).toBe(1700000000 * 1000);
    });

    it('atime returns 0 or negative → unknown', async () => {
      const { exec } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = (null)\n' },
        { out: '0\n' },
      ]);
      const r = await getLastOpened('/Applications/X.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('unknown');
      expect(r.ms).toBe(null);
    });

    it('atime returns garbage → unknown', async () => {
      const { exec } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = (null)\n' },
        { out: 'not a number\n' },
      ]);
      const r = await getLastOpened('/Applications/X.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('unknown');
      expect(r.ms).toBe(null);
    });
  });

  describe('both fail', () => {
    it('mdls throws + atime throws → source=unknown, ms=null', async () => {
      const { exec } = makeExecFileMock([
        { err: new Error('mdls failed') },
        { err: new Error('stat failed') },
      ]);
      const r = await getLastOpened('/Applications/X.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('unknown');
      expect(r.ms).toBe(null);
    });
  });

  describe('input validation', () => {
    it('bundlePath null → unknown, no exec call', async () => {
      const { exec, calls } = makeExecFileMock([]);
      const r = await getLastOpened(null, { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('unknown');
      expect(r.ms).toBe(null);
      expect(calls).toHaveLength(0);
    });

    it('bundlePath empty string → unknown, no exec call', async () => {
      const { exec, calls } = makeExecFileMock([]);
      const r = await getLastOpened('', { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('unknown');
      expect(calls).toHaveLength(0);
    });

    it('bundlePath non-string → unknown', async () => {
      const { exec, calls } = makeExecFileMock([]);
      const r = await getLastOpened(42, { execFileImpl: exec, now: FAKE_NOW });
      expect(r.source).toBe('unknown');
      expect(calls).toHaveLength(0);
    });
  });

  describe('cache', () => {
    it('hit within TTL → no 2nd exec call', async () => {
      const { exec, calls } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = 2026-06-07 10:08:39 +0000\n' },
      ]);
      const r1 = await getLastOpened('/Applications/Cursor.app', { execFileImpl: exec, now: FAKE_NOW });
      const r2 = await getLastOpened('/Applications/Cursor.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(r1).toEqual(r2);
      expect(calls).toHaveLength(1);  // 第二次走 cache, 没打 shell
    });

    it('expires after TTL → refreshes (2nd exec call)', async () => {
      const { exec, calls } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = 2026-06-07 10:08:39 +0000\n' },
        { out: 'kMDItemLastUsedDate = 2026-06-08 12:00:00 +0000\n' },
      ]);
      await getLastOpened('/Applications/Cursor.app', { execFileImpl: exec, now: FAKE_NOW });
      // 5 min + 1 ms 之后
      await getLastOpened(
        '/Applications/Cursor.app',
        { execFileImpl: exec, now: FAKE_NOW + CACHE_TTL_MS + 1 }
      );
      expect(calls).toHaveLength(2);
    });

    it('cache value correct after refresh (cache updated)', async () => {
      const { exec } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = 2026-06-07 10:08:39 +0000\n' },
        { out: 'kMDItemLastUsedDate = 2026-06-08 12:00:00 +0000\n' },
      ]);
      await getLastOpened('/Applications/Cursor.app', { execFileImpl: exec, now: FAKE_NOW });
      const entry = _cache.get('/Applications/Cursor.app');
      expect(entry.source).toBe('spotlight');
      expect(entry.ms).toBe(Date.parse('2026-06-07 10:08:39 +0000'));
      // refresh
      await getLastOpened(
        '/Applications/Cursor.app',
        { execFileImpl: exec, now: FAKE_NOW + CACHE_TTL_MS + 1 }
      );
      const entry2 = _cache.get('/Applications/Cursor.app');
      expect(entry2.ms).toBe(Date.parse('2026-06-08 12:00:00 +0000'));
    });
  });

  describe('refreshOne (skipCache)', () => {
    it('forces fresh fetch even if cache hit', async () => {
      const { exec, calls } = makeExecFileMock([
        { out: 'kMDItemLastUsedDate = 2026-06-07 10:08:39 +0000\n' },
        { out: 'kMDItemLastUsedDate = 2026-06-08 12:00:00 +0000\n' },
      ]);
      // first call populates cache
      await getLastOpened('/Applications/Cursor.app', { execFileImpl: exec, now: FAKE_NOW });
      expect(calls).toHaveLength(1);
      // refreshOne bypasses cache
      const r = await refreshOne('/Applications/Cursor.app', { execFileImpl: exec, now: FAKE_NOW + 1 });
      expect(calls).toHaveLength(2);
      expect(r.ms).toBe(Date.parse('2026-06-08 12:00:00 +0000'));
    });
  });
});
