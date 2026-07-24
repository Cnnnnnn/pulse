/**
 * tests/main/error-aggregator.test.js
 *
 * Phase Q6: pure aggregator — append/query/cleanup against a temp dir.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { createAggregator } = requireMain('error-aggregator');

let dir;
let agg;
const NOW = () => new Date('2026-06-20T15:30:12').getTime();

function makeEntry(overrides = {}) {
  return {
    source: 'main',
    level: 'error',
    message: 'Test error',
    stack: 'Error: Test\n  at foo (file.js:1)',
    context: { appVersion: '2.2.0', platform: 'darwin' },
    ...overrides,
  };
}

describe('error-aggregator', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pulse-err-'));
    agg = createAggregator({
      logsDir: dir,
      retentionDays: 30,
      now: NOW,
    });
  });

  it('append creates today file and writes valid JSONL', async () => {
    const entry = await agg.append(makeEntry());
    const files = readdirSync(dir);
    expect(files).toEqual(['errors-2026-06-20.jsonl']);
    const lines = readFileSync(join(dir, files[0]), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.message).toBe('Test error');
    expect(parsed.ts).toBe(NOW());
    expect(parsed.id).toMatch(/^err_2026-06-20_\d{6}_[a-z0-9]+$/);
  });

  it('append generates unique ids for multiple entries (same ts)', async () => {
    const a = await agg.append(makeEntry({ message: 'a' }));
    const b = await agg.append(makeEntry({ message: 'b' }));
    expect(a.id).not.toBe(b.id);
  });

  it('query returns all entries when no filter', async () => {
    await agg.append(makeEntry({ message: 'a' }));
    await agg.append(makeEntry({ message: 'b' }));
    const r = await agg.query({});
    expect(r.entries).toHaveLength(2);
    expect(r.stats.total).toBe(2);
  });

  it('query filters by since (ms)', async () => {
    await agg.append(makeEntry({ message: 'old', ts: 1000 }));
    await agg.append(makeEntry({ message: 'new', ts: NOW() }));
    const r = await agg.query({ since: NOW() - 1000 });
    expect(r.entries.map((e) => e.message)).toEqual(['new']);
  });

  it('query respects limit', async () => {
    for (let i = 0; i < 5; i++) await agg.append(makeEntry({ message: `m${i}` }));
    const r = await agg.query({ limit: 3 });
    expect(r.entries).toHaveLength(3);
  });

  it('query stats counts by level', async () => {
    await agg.append(makeEntry({ level: 'error' }));
    await agg.append(makeEntry({ level: 'warn' }));
    await agg.append(makeEntry({ level: 'error' }));
    const r = await agg.query({});
    expect(r.stats.byLevel).toEqual({ error: 2, warn: 1 });
  });

  it('cleanup removes files older than retentionDays', async () => {
    const today = new Date(NOW());
    const dates = [-1, -10, -40];
    for (const d of dates) {
      const dt = new Date(today.getTime() + d * 86400_000);
      const ymd = dt.toISOString().slice(0, 10);
      writeFileSync(join(dir, `errors-${ymd}.jsonl`), '{"id":"x","ts":0,"message":"old"}\n');
    }
    const removed = await agg.cleanup();
    expect(removed).toBe(1); // only -40d file
    const remaining = readdirSync(dir).sort();
    // -1d, -10d files within retention, plus -40d removed: 2 remaining
    expect(remaining).toHaveLength(2);
    expect(remaining.every((f) => f.startsWith('errors-'))).toBe(true);
  });

  it('corrupt JSONL lines are skipped during query (no crash)', async () => {
    writeFileSync(join(dir, 'errors-2026-06-20.jsonl'), 'not json\n{"id":"x","ts":1,"message":"ok"}\n');
    const r = await agg.query({});
    expect(r.entries.map((e) => e.message)).toEqual(['ok']);
    expect(r.stats.skipped).toBe(1);
  });

  it('handles concurrent appends without corrupting file', async () => {
    await Promise.all([
      agg.append(makeEntry({ message: 'a' })),
      agg.append(makeEntry({ message: 'b' })),
      agg.append(makeEntry({ message: 'c' })),
    ]);
    const r = await agg.query({});
    expect(r.entries).toHaveLength(3);
    const messages = r.entries.map((e) => e.message).sort();
    expect(messages).toEqual(['a', 'b', 'c']);
  });
});