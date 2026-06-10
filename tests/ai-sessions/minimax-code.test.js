/**
 * tests/ai-sessions/minimax-code.test.js
 *
 * Phase B7d.2 (AI Sessions Daily Digest): MiniMaxCodeDetectorImpl 测试.
 *
 * 覆盖:
 *   - _extractContent: array parts 拼字符串
 *   - _parseMessageRow: parse session_messages 一行 → {role, content, ts}
 *   - DetectorImpl.isInstalled / listSessions / readSession (mocked fs + sqlite)
 */

import { describe, it, expect, vi } from 'vitest';
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