import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CursorDetectorImpl } from '../../src/ai-sessions/cursor.js';

describe('CursorDetectorImpl — isInstalled (B2a)', () => {
  it('命中: bundle 存在 → true', () => {
    const spy = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    const d = new CursorDetectorImpl();
    expect(d.isInstalled()).toBe(true);
    expect(spy).toHaveBeenCalledWith('/Applications/Cursor.app');
    spy.mockRestore();
  });

  it('miss: bundle 不存在 → false', () => {
    const spy = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(false);
    const d = new CursorDetectorImpl();
    expect(d.isInstalled()).toBe(false);
    spy.mockRestore();
  });

  it('existsSync throw → false (graceful)', () => {
    const spy = vi.spyOn(require('fs'), 'existsSync').mockImplementation(() => { throw new Error('EACCES'); });
    const d = new CursorDetectorImpl();
    expect(d.isInstalled()).toBe(false);
    spy.mockRestore();
  });

  it('可注入 bundlePath (test 用)', () => {
    const spy = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    const d = new CursorDetectorImpl({ bundlePath: '/tmp/Cursor.app' });
    expect(d.isInstalled()).toBe(true);
    expect(spy).toHaveBeenCalledWith('/tmp/Cursor.app');
    spy.mockRestore();
  });
});

describe('CursorDetectorImpl — listSessions (B2a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('workspaceStorageDir 不存在 → []', async () => {
    const fsp = require('fs/promises');
    const spy = vi.spyOn(fsp, 'readdir').mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    const d = new CursorDetectorImpl();
    expect(await d.listSessions()).toEqual([]);
    spy.mockRestore();
  });

  it('权限不足 → [] (不 throw)', async () => {
    const fsp = require('fs/promises');
    const spy = vi.spyOn(fsp, 'readdir').mockRejectedValue(
      Object.assign(new Error('EACCES'), { code: 'EACCES' })
    );
    const d = new CursorDetectorImpl();
    expect(await d.listSessions()).toEqual([]);
    spy.mockRestore();
  });

  it('空目录 → []', async () => {
    const fsp = require('fs/promises');
    vi.spyOn(fsp, 'readdir').mockResolvedValue([]);
    const d = new CursorDetectorImpl();
    expect(await d.listSessions()).toEqual([]);
  });

  it('1 个 hash 目录 + state.vscdb → 1 个 SessionMeta', async () => {
    const fsp = require('fs/promises');
    const HASH = 'abc123def456';
    const FAKE_FILE = `/fake/workspaceStorage/${HASH}/state.vscdb`;
    vi.spyOn(fsp, 'readdir').mockResolvedValue([
      Object.assign({ name: HASH }, { isDirectory: () => true }),
    ]);
    vi.spyOn(fsp, 'stat').mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1700000000000,
      size: 5242880,
    });
    const d = new CursorDetectorImpl({ workspaceStorageDir: '/fake/workspaceStorage' });
    const out = await d.listSessions();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: HASH,
      file: FAKE_FILE,
      mtimeMs: 1700000000000,
      sizeBytes: 5242880,
    });
  });

  it('N 个 hash 目录 → N 个 SessionMeta', async () => {
    const fsp = require('fs/promises');
    const HASHES = ['hash1', 'hash2', 'hash3'];
    vi.spyOn(fsp, 'readdir').mockResolvedValue(
      HASHES.map((h) => Object.assign({ name: h }, { isDirectory: () => true }))
    );
    vi.spyOn(fsp, 'stat').mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1700000000000,
      size: 1000,
    });
    const d = new CursorDetectorImpl({ workspaceStorageDir: '/fake' });
    const out = await d.listSessions();
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.id)).toEqual(HASHES);
  });

  it('不是目录的 entry 跳过', async () => {
    const fsp = require('fs/promises');
    vi.spyOn(fsp, 'readdir').mockResolvedValue([
      { name: 'hash1', isDirectory: () => true },
      { name: 'some-file.txt', isDirectory: () => false },
    ]);
    vi.spyOn(fsp, 'stat').mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1, size: 1,
    });
    const d = new CursorDetectorImpl({ workspaceStorageDir: '/fake' });
    const out = await d.listSessions();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('hash1');
  });

  it('单个 state.vscdb stat 失败 → 跳过 + log warn (不 throw)', async () => {
    const fsp = require('fs/promises');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(fsp, 'readdir').mockResolvedValue([
      { name: 'good', isDirectory: () => true },
      { name: 'bad',  isDirectory: () => true },
    ]);
    vi.spyOn(fsp, 'stat').mockImplementation(async (file) => {
      if (file.endsWith('/bad/state.vscdb')) {
        throw Object.assign(new Error('EIO'), { code: 'EIO' });
      }
      return { isFile: () => true, mtimeMs: 1, size: 1 };
    });
    const d = new CursorDetectorImpl({ workspaceStorageDir: '/fake' });
    const out = await d.listSessions();
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('good');
    expect(warn).toHaveBeenCalled();
  });

  it('state.vscdb 不存在 (ENOENT) → 静默跳过 (no warn)', async () => {
    const fsp = require('fs/promises');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(fsp, 'readdir').mockResolvedValue([
      { name: 'h', isDirectory: () => true },
    ]);
    vi.spyOn(fsp, 'stat').mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    const d = new CursorDetectorImpl({ workspaceStorageDir: '/fake' });
    const out = await d.listSessions();
    expect(out).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('CursorDetectorImpl — readSession (B2a stub)', () => {
  it('抛 NotImplemented (B2b 才实现)', async () => {
    const d = new CursorDetectorImpl();
    await expect(d.readSession('abc')).rejects.toThrow(/not implemented/i);
  });
});
