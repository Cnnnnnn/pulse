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

  it('单 row 数组形式 [{role, content, ts}] → 正常 parse', () => {
    const rows = [{
      key: 'aiService.prompts:abc',
      value: JSON.stringify([
        { role: 'user', content: 'hi', timestamp: 1000 },
        { role: 'assistant', content: 'hello', timestamp: 2000 },
      ]),
    }];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0]).toMatchObject({ role: 'user', content: 'hi', ts: 1000 });
    expect(s.messages[1]).toMatchObject({ role: 'assistant', content: 'hello', ts: 2000 });
    expect(s.startedAt).toBe(1000);
    expect(s.endedAt).toBe(2000);
  });

  it('object 形式 {messages: [...]} → 正常 parse', () => {
    const rows = [{
      key: 'aiService.prompts:def',
      value: JSON.stringify({
        messages: [
          { role: 'user', content: 'q1', timestamp: 3000 },
        ],
      }),
    }];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].ts).toBe(3000);
  });

  it('ts 字段名兼容: timestamp / ts / time / createdAt / string number', () => {
    const rows = [{
      key: 'k',
      value: JSON.stringify([
        { role: 'user', content: 'a', timestamp: 1 },
        { role: 'user', content: 'b', ts: 2 },
        { role: 'user', content: 'c', time: 3 },
        { role: 'user', content: 'd', createdAt: 4 },
        { role: 'user', content: 'e', timestamp: '12345' },  // string number
      ]),
    }];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages.map((m) => m.ts)).toEqual([1, 2, 3, 4, 12345]);
  });

  it('messages 缺 ts → 排到末尾 (sort stable)', () => {
    const rows = [{
      key: 'k',
      value: JSON.stringify([
        { role: 'user', content: 'no-ts-1' },
        { role: 'user', content: 'a', ts: 100 },
        { role: 'user', content: 'no-ts-2' },
      ]),
    }];
    const s = _parseSessionRows('h1', rows);
    // 100 在中间, no-ts 排末尾 (sort by (ts || 0) = 0, 跟 0 同 stable)
    expect(s.messages[0].content).toBe('a');
    expect(s.messages[0].ts).toBe(100);
  });

  it('parse 失败的 row 跳过 + log warn (不 throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = [
      { key: 'k1', value: 'not json' },
      { key: 'k2', value: JSON.stringify([{ role: 'user', content: 'ok', ts: 1 }]) },
      { key: 'k3', value: '{"notMessages": "wrong shape"}' },
    ];
    const s = _parseSessionRows('h1', rows);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].content).toBe('ok');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('startedAt = first msg ts, endedAt = last msg ts (排序后)', () => {
    const rows = [{
      key: 'k',
      value: JSON.stringify([
        { role: 'user', content: 'b', ts: 200 },
        { role: 'user', content: 'a', ts: 100 },
        { role: 'user', content: 'c', ts: 300 },
      ]),
    }];
    const s = _parseSessionRows('h1', rows);
    expect(s.startedAt).toBe(100);
    expect(s.endedAt).toBe(300);
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
