/**
 * tests/ai-sessions/minimax-code.test.js
 *
 * Phase B7d.2 (AI Sessions Daily Digest): MiniMaxCodeDetectorImpl 测试.
 *
 * 覆盖:
 *   - _extractContent: array parts 拼字符串
 *   - _parseMessageRow: parse session_messages 一行 → {role, content, ts}
 *   - DetectorImpl.isInstalled / listSessions / readSession (mocked fs + sqlite)
 *   - CLI fallback (WAL snapshot bug workaround)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  MiniMaxCodeDetectorImpl,
  _parseMessageRow,
  _extractContent,
} from '../../src/ai-sessions/minimax-code.js';

describe('minimax-code._extractContent', () => {
  it('array of text/content parts → joined', () => {
    expect(_extractContent([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ])).toBe('a\nb');
  });

  it('空 array → ""', () => {
    expect(_extractContent([])).toBe('');
  });

  it('非 array → ""', () => {
    expect(_extractContent(null)).toBe('');
    expect(_extractContent('hi')).toBe('');
  });

  it('跳非 text/content 字段', () => {
    expect(_extractContent([
      { type: 'image', image_url: 'http://...' },
      { text: 'left' },
    ])).toBe('left');
  });
});

describe('minimax-code._parseMessageRow', () => {
  it('data 是 JSON with string content', () => {
    const row = {
      role: 'user',
      data: JSON.stringify({ msg_id: 'm1', role: 'user', content: 'hi', timestamp: 1778736771418 }),
      timestamp: 1778736771418,
    };
    expect(_parseMessageRow(row)).toEqual({ role: 'user', content: 'hi', ts: 1778736771418 });
  });

  it('data 是 JSON with array content', () => {
    const row = {
      role: 'assistant',
      data: JSON.stringify({
        msg_id: 'm2',
        role: 'assistant',
        content: [{ type: 'text', text: 'reply' }, { type: 'text', text: 'continued' }],
        timestamp: 1778736772000,
      }),
      timestamp: 1778736772000,
    };
    const out = _parseMessageRow(row);
    expect(out.role).toBe('assistant');
    expect(out.content).toBe('reply\ncontinued');
    expect(out.ts).toBe(1778736772000);
  });

  it('data 是 plain string (data 不是 JSON 字符串)', () => {
    const row = { role: 'user', data: 'just a plain string', timestamp: 1000 };
    const out = _parseMessageRow(row);
    expect(out.role).toBe('user');
    expect(out.content).toBe('just a plain string');
    expect(out.ts).toBe(1000);
  });

  it('data.msg_content (MiniMax daemon 字段名, 不是 content/text)', () => {
    const row = {
      role: 'user',
      data: JSON.stringify({
        msg_id: 'm1',
        role: 'user',
        msg_type: 1,
        msg_content: 'minimax daemon 实际用的字段',
        timestamp: 1778736771418,
        source: 'api',
      }),
      timestamp: 1778736771418,
    };
    expect(_parseMessageRow(row)).toEqual({
      role: 'user',
      content: 'minimax daemon 实际用的字段',
      ts: 1778736771418,
    });
  });

  it('priority: content > text > msg_content > msg_text', () => {
    // content 优先
    expect(_parseMessageRow({ role: 'user', data: JSON.stringify({ content: 'a', msg_content: 'b' }), timestamp: 1 }))
      .toMatchObject({ content: 'a' });
    // 没 content 时 text 优先
    expect(_parseMessageRow({ role: 'user', data: JSON.stringify({ text: 'a', msg_content: 'b' }), timestamp: 1 }))
      .toMatchObject({ content: 'a' });
    // 只有 msg_content 也 OK
    expect(_parseMessageRow({ role: 'user', data: JSON.stringify({ msg_content: 'a' }), timestamp: 1 }))
      .toMatchObject({ content: 'a' });
  });

  it('空 content → 返 null (跳过)', () => {
    const row = {
      role: 'user',
      data: JSON.stringify({ role: 'user', content: '', timestamp: 1000 }),
      timestamp: 1000,
    };
    expect(_parseMessageRow(row)).toBeNull();
  });

  it('role 不规范 → normalize 成 unknown', () => {
    const row = {
      role: 'weird',
      data: JSON.stringify({ role: 'weird', content: 'hi', timestamp: 1000 }),
      timestamp: 1000,
    };
    expect(_parseMessageRow(row).role).toBe('unknown');
  });

  it('data row.role 用作 fallback (data 没 role)', () => {
    const row = {
      role: 'user',
      data: JSON.stringify({ content: 'hi' }),
      timestamp: 1000,
    };
    expect(_parseMessageRow(row).role).toBe('user');
  });

  it('timestamp 优先用 data.timestamp, fallback row.timestamp', () => {
    const a = _parseMessageRow({
      role: 'user',
      data: JSON.stringify({ content: 'a', timestamp: 5000 }),
      timestamp: 9999,
    });
    expect(a.ts).toBe(5000);

    const b = _parseMessageRow({
      role: 'user',
      data: JSON.stringify({ content: 'b' }),  // 没 timestamp
      timestamp: 9999,
    });
    expect(b.ts).toBe(9999);
  });

  it('null row → null', () => {
    expect(_parseMessageRow(null)).toBeNull();
  });

  it('row.role 缺失 → null', () => {
    expect(_parseMessageRow({ data: '{}' })).toBeNull();
  });
});

describe('MiniMaxCodeDetectorImpl — basic behavior', () => {
  it('readSession(id) id 空 → throw TypeError', async () => {
    const d = new MiniMaxCodeDetectorImpl();
    await expect(d.readSession('')).rejects.toThrow(TypeError);
  });

  it('isInstalled: 不存在 → false', () => {
    const d = new MiniMaxCodeDetectorImpl({
      bundlePath: '/nonexistent-minimax-bundle-xyz',
      sqlitePath: '/nonexistent-minimax-sqlite-xyz',
    });
    expect(d.isInstalled()).toBe(false);
  });
});

describe('MiniMaxCodeDetectorImpl — CLI fallback (WAL snapshot workaround)', () => {
  // 真实 sqlite db + spawn sqlite3 CLI, 模拟 WAL snapshot bug 场景.
  // 这个测试确保即使 node:sqlite 在 Electron 里读 WAL 出 0 rows, CLI 路径也能 work.
  let tmpDir;
  let dbPath;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'minimax-cli-fallback-'));
    dbPath = path.join(tmpDir, 'sqlite.db');
    // 用 sqlite3 CLI 建表 + 插数据 (走 stdin 避免 shell 转义引号问题)
    const schema = [
      "CREATE TABLE sessions (",
      "  session_id TEXT PRIMARY KEY,",
      "  title TEXT, workspace_dir TEXT, effective_model TEXT, status TEXT,",
      "  created_at INTEGER, updated_at INTEGER, framework_type TEXT",
      ");",
      "CREATE TABLE session_messages (",
      "  id INTEGER PRIMARY KEY AUTOINCREMENT, msg_id TEXT, role TEXT,",
      "  data TEXT, timestamp INTEGER, session_id TEXT",
      ");",
      "INSERT INTO sessions VALUES ('mvs_test_001','Test session','/Users/me/proj','minimax/M3','finished',1000000,2000000,'opencode');",
      "INSERT INTO sessions VALUES ('mvs_test_002','Another','/Users/me/proj2','minimax/M3','started',1500000,2500000,'opencode');",
      "INSERT INTO session_messages (session_id,role,data,timestamp) VALUES ('mvs_test_001','user','{\"role\":\"user\",\"msg_content\":\"hi\",\"msg_type\":1,\"timestamp\":2000000}',2000000);",
      "INSERT INTO session_messages (session_id,role,data,timestamp) VALUES ('mvs_test_001','assistant','{\"role\":\"assistant\",\"msg_content\":\"hello\",\"msg_type\":2,\"timestamp\":2001000}',2001000);",
    ].join('\n');
    execSync(`sqlite3 "${dbPath}"`, { input: schema, stdio: ['pipe', 'pipe', 'pipe'] });
  });

  it('listSessions: node:sqlite 拿 0 rows 时 fallback 到 sqlite3 CLI', async () => {
    // 直接调 _listSessionsViaCli 验证 (因为我们 mock 不到 node:sqlite 的 0 rows 行为)
    const { _listSessionsViaCli } = await import('../../src/ai-sessions/minimax-code.js');
    const rows = await _listSessionsViaCli(dbPath);
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe('mvs_test_002');  // updated_at DESC
    expect(rows[0]._title).toBe('Another');
    expect(rows[0]._workspaceDir).toBe('/Users/me/proj2');
    expect(rows[1].id).toBe('mvs_test_001');
  });

  it('readSession via CLI: parse messages 正确', async () => {
    const { _readSessionViaCli } = await import('../../src/ai-sessions/minimax-code.js');
    const sess = await _readSessionViaCli(dbPath, 'mvs_test_001');
    expect(sess.id).toBe('mvs_test_001');
    expect(sess.messages.length).toBe(2);
    expect(sess.messages[0]).toMatchObject({ role: 'user', content: 'hi', ts: 2000000 });
    expect(sess.messages[1]).toMatchObject({ role: 'assistant', content: 'hello', ts: 2001000 });
    expect(sess.startedAt).toBe(2000000);
    expect(sess.endedAt).toBe(2001000);
  });

  it('readSession via CLI: 不存在的 session_id → empty messages', async () => {
    const { _readSessionViaCli } = await import('../../src/ai-sessions/minimax-code.js');
    const sess = await _readSessionViaCli(dbPath, 'mvs_nonexistent');
    expect(sess.messages).toEqual([]);
    expect(sess.startedAt).toBe(0);
    expect(sess.endedAt).toBe(0);
  });
});