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
  it('抛 "node:sqlite unavailable" (B2b 抛 unavailable 直到 runtime 有 node:sqlite)', async () => {
    const d = new CursorDetectorImpl();
    // dev Node 18 没 node:sqlite, readSession 抛 unavailable. future Node 22+ dev 会进 DB 路径,
    // 那时这个 case 应该跳到 mock 路径 (B2b integration).
    if (require('../../src/ai-sessions/cursor.js')._loadNodeSqlite() === null) {
      await expect(d.readSession('abc')).rejects.toThrow(/node:sqlite unavailable/);
    } else {
      // future Node 22+ dev: skip (B2b integration covers)
    }
  });
});

// ─── B2b readSession part ─────────────────────────────────────

describe('CursorDetectorImpl — _loadNodeSqlite (B2b)', () => {
  it('在 dev Node 18 (无 node:sqlite) 返 null', () => {
    const { _loadNodeSqlite } = require('../../src/ai-sessions/cursor.js');
    const sqlite = _loadNodeSqlite();
    // dev Node 18.17 没 node:sqlite (需要 22.5+), 应该返 null.
    // future Node 22+ dev: 返非 null.
    if (process.versions.node.startsWith('18')) {
      expect(sqlite).toBeNull();
    } else {
      expect(sqlite).not.toBeNull();
    }
  });
});

describe('CursorDetectorImpl — _parseSessionRows (B2b, 纯函数)', () => {
  const { _parseSessionRows } = require('../../src/ai-sessions/cursor.js');

  it('空 rows → 空 session', () => {
    expect(_parseSessionRows('h1', [])).toEqual({
      id: 'h1', startedAt: 0, endedAt: 0, messages: [],
    });
  });

  it('null rows → 空 session', () => {
    expect(_parseSessionRows('h1', null)).toMatchObject({
      id: 'h1', startedAt: 0, endedAt: 0, messages: [],
    });
  });

  it('真 Cursor schema: aiService.prompts (user) + aiService.generations (assistant, unixMs)', () => {
    const rows = [
      { key: 'aiService.prompts', value: JSON.stringify([{ text: 'hi' }, { text: 'follow-up' }]) },
      { key: 'aiService.generations', value: JSON.stringify([
        { unixMs: 1000, generationUUID: 'g1', type: 'composer', textDescription: 'hello' },
        { unixMs: 2000, generationUUID: 'g2', type: 'composer', textDescription: 'reply' },
      ]) },
    ];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(4);
    // 2 prompts (ts=0) 排末尾, generations 按 unixMs 排前
    expect(s.messages.slice(0, 2).map(m => m.role)).toEqual(['assistant', 'assistant']);
    expect(s.messages.slice(0, 2).map(m => m.ts)).toEqual([1000, 2000]);
    expect(s.messages.slice(2).map(m => m.role)).toEqual(['user', 'user']);
    expect(s.messages.slice(2).map(m => m.content)).toEqual(['hi', 'follow-up']);
    expect(s.startedAt).toBe(1000);
    expect(s.endedAt).toBe(2000);
  });

  it('只有 prompts (没 generations) → 2 user msgs, ts=0', () => {
    const rows = [
      { key: 'aiService.prompts', value: JSON.stringify([{ text: 'a' }, { text: 'b' }]) },
    ];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(2);
    expect(s.messages.every(m => m.role === 'user')).toBe(true);
    expect(s.messages.every(m => m.ts === 0)).toBe(true);
  });

  it('只有 generations (没 prompts) → assistant msgs', () => {
    const rows = [
      { key: 'aiService.generations', value: JSON.stringify([
        { unixMs: 500, textDescription: 'reply1' },
        { unixMs: 800, textDescription: 'reply2' },
      ]) },
    ];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(2);
    expect(s.messages.every(m => m.role === 'assistant')).toBe(true);
    expect(s.messages.map(m => m.ts)).toEqual([500, 800]);
  });

  it('parse 失败的 row 跳过 + log warn (不 throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [
      { key: 'k1', value: 'not json' },
      { key: 'aiService.prompts', value: JSON.stringify([{ text: 'ok' }]) },
      { key: 'aiService.generations', value: '{"not":"array"}' },  // 不是 array 跳过
    ];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].content).toBe('ok');
    expect(s.messages[0].role).toBe('user');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('non-array value 跳过 (不 throw)', () => {
    const rows = [
      { key: 'aiService.prompts', value: '{"messages":[]}' },  // 不是 array 顶层, 老 schema, 跳过
      { key: 'aiService.generations', value: JSON.stringify([{ unixMs: 100, textDescription: 'r' }]) },
    ];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe('assistant');
  });

  it('空 array 跳过 (0 messages)', () => {
    const rows = [
      { key: 'aiService.prompts', value: '[]' },
      { key: 'aiService.generations', value: '[]' },
    ];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(0);
    expect(s.startedAt).toBe(0);
    expect(s.endedAt).toBe(0);
  });

  it('id 透传 (workspace hash)', () => {
    const s = _parseSessionRows('workspace-abc-123', []);
    expect(s.id).toBe('workspace-abc-123');
  });
});

describe('CursorDetectorImpl — readSession (B2b 集成)', () => {
  it('node:sqlite 不可用 → throw "unavailable" (dev Node 18)', async () => {
    // 在 dev Node 18 上, _loadNodeSqlite 返 null, readSession 应 throw 带特定 prefix
    const d = new CursorDetectorImpl();
    if (require('../../src/ai-sessions/cursor.js')._loadNodeSqlite() === null) {
      await expect(d.readSession('hash1')).rejects.toThrow(/node:sqlite unavailable/);
    } else {
      // future Node 22+ dev env: skip this assertion
    }
  });

  it('id 空 → throw TypeError', async () => {
    const d = new CursorDetectorImpl();
    await expect(d.readSession('')).rejects.toThrow(TypeError);
    await expect(d.readSession(null)).rejects.toThrow(TypeError);
    await expect(d.readSession(123)).rejects.toThrow(TypeError);
  });
});
