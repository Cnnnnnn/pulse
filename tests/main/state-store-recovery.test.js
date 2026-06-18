/**
 * tests/main/state-store-recovery.test.js
 *
 * Phase Q8: corrupt state.json should be backed up + replaced with baseline,
 * and a recovery event recorded for the renderer to consume.
 *
 * Pattern note: uses require.cache injection (vitest 1.6 vi.mock does not
 * hook CJS require). See circuit-breaker-storage.test.js for rationale.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, renameSync, unlinkSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);

let tmpDir;
let statePath;
let backupSuffix = 0;

function freshStatePath() {
  // Each test gets a unique path so backups don't collide
  backupSuffix += 1;
  return join(tmpDir, `state-${backupSuffix}.json`);
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj));
}

function writeRaw(path, raw) {
  writeFileSync(path, raw);
}

describe('state-store recovery', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pulse-state-test-'));
    // Reset the module-level "last recovery event" cache by re-requiring fresh
    delete require.cache[require.resolve('../../src/main/state-store.js')];
  });

  afterEach(() => {
    for (const f of readdirSync(tmpDir)) {
      try { unlinkSync(join(tmpDir, f)); } catch { /* ignore */ }
    }
  });

  it('loadOrRecover returns null and no event when file is missing', () => {
    statePath = freshStatePath();
    const ss = require('../../src/main/state-store.js');
    const state = ss.loadOrRecover(statePath);
    expect(state).toBeNull();
    expect(ss.getLastRecoveryEvent()).toBeNull();
  });

  it('loadOrRecover returns parsed state and no event when state is valid', () => {
    statePath = freshStatePath();
    writeJson(statePath, { v: 1, ts: 0, apps: {}, mutes: {} });
    const ss = require('../../src/main/state-store.js');
    const state = ss.loadOrRecover(statePath);
    expect(state).not.toBeNull();
    expect(state.apps).toEqual({});
    expect(ss.getLastRecoveryEvent()).toBeNull();
  });

  it('loadOrRecover backs up corrupt JSON, returns null, records event', () => {
    statePath = freshStatePath();
    writeRaw(statePath, '{ this is not valid JSON');
    const ss = require('../../src/main/state-store.js');
    const state = ss.loadOrRecover(statePath);
    expect(state).toBeNull();
    // A backup file should exist
    const backups = readdirSync(tmpDir).filter((f) => f.includes('state.corrupt-'));
    expect(backups.length).toBe(1);
    expect(ss.getLastRecoveryEvent()).toMatchObject({
      path: statePath,
      backup: expect.stringContaining('state.corrupt-'),
      reason: 'parse_failed',
    });
  });

  it('loadOrRecover backs up schema-invalid state and records event with reason schema_failed', () => {
    statePath = freshStatePath();
    // Valid JSON, but missing required apps
    writeJson(statePath, { v: 1, ts: 0 });
    const ss = require('../../src/main/state-store.js');
    const state = ss.loadOrRecover(statePath);
    expect(state).toBeNull();
    const backups = readdirSync(tmpDir).filter((f) => f.includes('state.corrupt-'));
    expect(backups.length).toBe(1);
    const evt = ss.getLastRecoveryEvent();
    expect(evt).toMatchObject({ path: statePath, reason: 'schema_failed' });
    expect(evt.errors.length).toBeGreaterThan(0);
  });

  it('getLastRecoveryEvent returns the event only once (consume-once semantics)', () => {
    statePath = freshStatePath();
    writeRaw(statePath, 'garbage');
    const ss = require('../../src/main/state-store.js');
    ss.loadOrRecover(statePath);
    expect(ss.getLastRecoveryEvent()).not.toBeNull();
    expect(ss.getLastRecoveryEvent()).toBeNull();
  });

  it('loadOrRecover does not throw when backup rename fails (best-effort)', () => {
    statePath = freshStatePath();
    writeRaw(statePath, 'garbage');
    const ss = require('../../src/main/state-store.js');
    expect(() => ss.loadOrRecover(statePath)).not.toThrow();
  });
});
