/**
 * tests/main/timer-registry-audit.test.js
 *
 * Phase Q5 v1: audit unit tests against the 5 fixture files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { auditTimers } = require('../../src/main/timer-registry.js');

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/timer-audit',
);

describe('auditTimers on committed fixtures', () => {
  it('clean.js 被识别为 clean', () => {
    const s = auditTimers(FIXTURE_DIR);
    const clean = s.entries.find((e) => e.file === 'clean.js');
    expect(clean).toBeDefined();
    expect(clean.kind).toBe('clean');
    expect(clean.hasCleanup).toBe(true);
  });

  it('orphan.js 被识别为 orphan', () => {
    const s = auditTimers(FIXTURE_DIR);
    const orphan = s.entries.find((e) => e.file === 'orphan.js');
    expect(orphan).toBeDefined();
    expect(orphan.kind).toBe('orphan');
    expect(orphan.hasCleanup).toBe(false);
  });

  it('debounce.js 至少一个 site 标记 debounce', () => {
    const s = auditTimers(FIXTURE_DIR);
    const debounces = s.entries.filter(
      (e) => e.file === 'debounce.js' && e.kind === 'debounce',
    );
    expect(debounces.length).toBeGreaterThanOrEqual(1);
  });

  it('dup-schedule.js 至少一个 site 标记 dup-schedule', () => {
    const s = auditTimers(FIXTURE_DIR);
    const dup = s.entries.filter(
      (e) => e.file === 'dup-schedule.js' && e.kind === 'dup-schedule',
    );
    expect(dup.length).toBeGreaterThanOrEqual(1);
  });

  it('commented.js 不计入 total', () => {
    const s = auditTimers(FIXTURE_DIR);
    const commented = s.entries.filter((e) => e.file === 'commented.js');
    expect(commented).toHaveLength(0);
  });

  it('summary 数字自洽: total = clean + orphan + debounce + dupSchedule', () => {
    const s = auditTimers(FIXTURE_DIR);
    expect(s.total).toBe(s.clean + s.orphan + s.debounce + s.dupSchedule);
  });

  it('空目录返回 zeroed summary', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'q5-audit-'));
    try {
      const s = auditTimers(emptyDir);
      expect(s.total).toBe(0);
      expect(s.entries).toHaveLength(0);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('传非法 rootDir 返回 zeroed summary 不抛', () => {
    expect(() => auditTimers('')).not.toThrow();
    expect(() => auditTimers(null)).not.toThrow();
    expect(auditTimers(null).total).toBe(0);
  });
});

describe('auditTimers logger integration', () => {
  it('logger.info 在每次有 site 时被调', () => {
    const info = vi.fn();
    const warn = vi.fn();
    auditTimers(FIXTURE_DIR, { logger: { info, warn } });
    // summary 1 + 每个 site 至少 1
    expect(info).toHaveBeenCalled();
    const allCalls = info.mock.calls.map((c) => c.join(' '));
    expect(allCalls.some((line) => line.includes('[timer-registry] audit:'))).toBe(true);
  });
});
