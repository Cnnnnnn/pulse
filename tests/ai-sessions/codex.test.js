/**
 * tests/ai-sessions/codex.test.js
 *
 * CodexDetectorImpl 测试 — 2026-06-10 rev2:
 *   _parseCodexJsonl 返单个 Session { id, startedAt, endedAt, messages, title, workspaceDir? }
 *   跟 Cursor / minimax-code 一致: 1 JSONL = 1 session (一整次 Codex 对话窗口).
 *   之前的 topic-split 被撤销 (同一会话多次 user_query 视为连续对话, 不切).
 *
 * 覆盖:
 *   - _idFromFilename: 从 rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl 抽出 uuid
 *   - _extractResponseContent: 抽 input_text parts 拼成单字符串
 *   - _extractCodexTitle: 跳 AGENTS.md / 路径 / URL / XML 标签, 命中真 user_query
 *   - _parseCodexJsonl: 解析整个 JSONL → 1 Session (含 title)
 *   - DetectorImpl.isInstalled() / listSessions() / readSession() (mocked fs)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CodexDetectorImpl,
  _parseCodexJsonl,
  _extractCodexTitle,
  _idFromFilename,
  _extractResponseContent,
} from '../../src/ai-sessions/codex.js';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';

describe('codex._idFromFilename', () => {
  it('从 rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl 抽出 uuid', () => {
    expect(_idFromFilename('rollout-2026-04-20T12-34-30-019da92b-2493-70b3-b67d-ca67bd27b1a6.jsonl'))
      .toBe('019da92b-2493-70b3-b67d-ca67bd27b1a6');
  });

  it('不匹配的非 rollout 文件 → null', () => {
    expect(_idFromFilename('foo.jsonl')).toBe(null);
    expect(_idFromFilename('rollout-foo.jsonl')).toBe(null);
  });
});

describe('codex._extractResponseContent', () => {
  it('array of input_text parts → joined text', () => {
    const out = _extractResponseContent([
      { type: 'input_text', text: 'hello' },
      { type: 'input_text', text: 'world' },
    ]);
    expect(out).toBe('hello\nworld');
  });

  it('空 array → ""', () => {
    expect(_extractResponseContent([])).toBe('');
  });

  it('非 array → ""', () => {
    expect(_extractResponseContent(null)).toBe('');
    expect(_extractResponseContent('hi')).toBe('');
  });

  it('容错: input_text 字段名 (不是 text)', () => {
    const out = _extractResponseContent([{ input_text: 'fallback name' }]);
    expect(out).toBe('fallback name');
  });

  it('跳非 text 字段 (e.g. image_url)', () => {
    const out = _extractResponseContent([
      { type: 'input_text', text: 'before' },
      { type: 'input_image', image_url: 'http://...' },
      { type: 'input_text', text: 'after' },
    ]);
    expect(out).toBe('before\nafter');
  });
});

describe('codex._extractCodexTitle — denoise', () => {
  it('user 消息首行有意义 → 直接用', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: '帮我看下 ntb-cvp-limit-success 实现' },
      { role: 'assistant', content: '好的...' },
    ]);
    expect(title).toBe('帮我看下 ntb-cvp-limit-success 实现');
  });

  it('跳过 AGENTS.md system 注入 (markdow 标题开头)', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: '# AGENTS.md instructions\n真实用户 query' },
    ]);
    expect(title).toBe('真实用户 query');
  });

  it('跳过 <permissions> / <env> / <ide_selection> 注入块', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: '<permissions>read-only</permissions>\n<env>NODE_ENV=test</env>\n<ide_selection>main.ts:1-3</ide_selection>\n实际问的内容' },
    ]);
    expect(title).toBe('实际问的内容');
  });

  it('跳过绝对路径行 (开头)', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: '/Users/me/project/foo.ts\n修复一下' },
    ]);
    expect(title).toBe('修复一下');
  });

  it('跳过绝对路径行 (行内, e.g. "- config.toml: /Users/me/config.toml")', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: '- config.toml: /Users/me/.codex/config.toml\n再次分析下看看' },
    ]);
    expect(title).toBe('再次分析下看看');
  });

  it('跳过 URL 行', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: 'https://example.com/docs\n看这个文档' },
    ]);
    expect(title).toBe('看这个文档');
  });

  it('title 截断到 48 字符', () => {
    const long = '这是一段非常非常非常非常非常非常非常非常非常非常非常非常非常长的标题';
    const title = _extractCodexTitle([{ role: 'user', content: long }]);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title).toContain('这是一段');
  });

  it('user 都是噪声 → fallback 到 assistant 第一行', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: '# AGENTS.md\n/Users/me/foo.ts' },
      { role: 'assistant', content: '我会帮你分析 ntb-cvp-limit-success.md' },
    ]);
    expect(title).toBe('我会帮你分析 ntb-cvp-limit-success.md');
  });

  it('messages 空 → ""', () => {
    expect(_extractCodexTitle([])).toBe('');
    expect(_extractCodexTitle(null)).toBe('');
  });

  it('跳过短确认 query (可以/好的/ok) 找下一条有信息量的', () => {
    // 第一条 user "可以" 太短 → 跳, 命中第二条 "分析 ntb-cvp-limit-success.md 实现"
    const title = _extractCodexTitle([
      { role: 'user', content: '可以' },
      { role: 'assistant', content: '好的, 让我看...' },
      { role: 'user', content: '分析 ntb-cvp-limit-success.md 实现' },
    ]);
    expect(title).toBe('分析 ntb-cvp-limit-success.md 实现');
  });

  it('跳过 < 8 字符 query, 包括纯语气词', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: '好' },
      { role: 'user', content: '嗯' },
      { role: 'user', content: 'ok' },
      { role: 'user', content: '麻烦看下首页那个弹窗逻辑' },
    ]);
    expect(title).toBe('麻烦看下首页那个弹窗逻辑');
  });

  it('所有 user 都是短确认 → fallback 第一条 user', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: '可以' },
      { role: 'user', content: '好的' },
      { role: 'user', content: 'ok' },
    ]);
    expect(title).toBe('可以');  // fallback 第一条 user, 哪怕不 informative
  });

  it('全是 user 都 < 8 字符但不是语气词 → fallback', () => {
    const title = _extractCodexTitle([
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'hello' },
      { role: 'user', content: 'a long enough line to pass filter' },
    ]);
    expect(title).toBe('a long enough line to pass filter');
  });
});

describe('codex._parseCodexJsonl — stream parse', () => {
  let tmpDir;
  let tmpFile;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-test-'));
    tmpFile = path.join(tmpDir, 'rollout-2026-04-20T12-34-30-test-uuid-1234.jsonl');
  });

  it('解析 session_meta + response_item → 1 Session (rev2: 不切 topic)', async () => {
    const lines = [
      JSON.stringify({
        timestamp: '2026-04-20T04:34:30.174Z',
        type: 'session_meta',
        payload: { id: 'test-uuid-1234', cwd: '/Users/me/proj', cli_version: '0.122.0' },
      }),
      // AGENTS.md system 注入 (response_item.user.role) → 跳过
      JSON.stringify({
        timestamp: '2026-04-20T04:35:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '# AGENTS.md instructions\nUse RTK for shell commands' }],
        },
      }),
      // event_msg.user_message → 真用户 query
      JSON.stringify({
        timestamp: '2026-04-20T04:38:02.214Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: '帮我看下 ntb-cvp-limit-success' },
      }),
      // event_msg.agent_message → assistant
      JSON.stringify({
        timestamp: '2026-04-20T04:39:00.000Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: '好的, 让我先看...' },
      }),
      // 其它 event_msg type → 跳过
      JSON.stringify({
        timestamp: '2026-04-20T04:39:01.000Z',
        type: 'event_msg',
        payload: { type: 'token_count', info: { total: 100 } },
      }),
      // response_item.assistant → 也保留
      JSON.stringify({
        timestamp: '2026-04-20T04:39:30.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'input_text', text: '分析结果...' }],
        },
      }),
    ];
    await fsp.writeFile(tmpFile, lines.join('\n') + '\n');

    const sess = await _parseCodexJsonl(tmpFile);
    expect(sess.id).toBe('test-uuid-1234');
    expect(sess.workspaceDir).toBe('/Users/me/proj');
    expect(sess.messages.length).toBe(3);
    expect(sess.messages[0]).toMatchObject({ role: 'user', content: '帮我看下 ntb-cvp-limit-success' });
    expect(sess.messages[1].content).toBe('好的, 让我先看...');
    expect(sess.messages[2].content).toBe('分析结果...');
    expect(sess.title).toBe('帮我看下 ntb-cvp-limit-success');
    expect(sess.startedAt).toBeLessThanOrEqual(sess.endedAt);
  });

  it('多 user_message → 1 Session (多轮连续, 不切)', async () => {
    const lines = [
      JSON.stringify({
        timestamp: '2026-04-20T04:34:30.174Z',
        type: 'session_meta',
        payload: { id: 'multi-uuid', cwd: '/Users/me/proj' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:35:00.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: '分析下 ntb-cvp-limit-success.md' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:35:30.000Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: '让我看看...' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T05:00:00.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: '实现还缺乏什么呢' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T05:00:30.000Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: '看了一下还缺 X, Y, Z' },
      }),
    ];
    await fsp.writeFile(tmpFile, lines.join('\n') + '\n');

    const sess = await _parseCodexJsonl(tmpFile);
    expect(sess.id).toBe('multi-uuid');
    expect(sess.messages.length).toBe(4); // 2 user + 2 assistant
    expect(sess.title).toContain('ntb-cvp-limit-success'); // 第一条 user 第一行
  });

  it('空文件 → Session 但 messages 空', async () => {
    await fsp.writeFile(tmpFile, '');
    const sess = await _parseCodexJsonl(tmpFile);
    expect(sess.id).toBe('test-uuid-1234');
    expect(sess.messages).toEqual([]);
    expect(sess.startedAt).toBe(0);
    expect(sess.endedAt).toBe(0);
    expect(sess.title).toBe('');
  });

  it('坏行 → 跳过, 不 throw', async () => {
    const lines = [
      'this is not json',
      JSON.stringify({
        timestamp: '2026-04-20T04:38:02Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'still ok' },
      }),
      '{malformed{json',
    ];
    await fsp.writeFile(tmpFile, lines.join('\n') + '\n');
    const sess = await _parseCodexJsonl(tmpFile);
    expect(sess.messages.length).toBe(1);
    expect(sess.messages[0].content).toBe('still ok');
  });

  it('response_item.user 是 AGENTS.md 系统注入, 不进 messages', async () => {
    const lines = [
      JSON.stringify({
        timestamp: '2026-04-20T04:34:30Z',
        type: 'session_meta',
        payload: { id: 'uuid-sysinj' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:35:00Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '# AGENTS.md\n\nUse RTK by default' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:36:00Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: '实际 query' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:37:00Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: '回复' },
      }),
    ];
    await fsp.writeFile(tmpFile, lines.join('\n') + '\n');
    const sess = await _parseCodexJsonl(tmpFile);
    // AGENTS.md 不进 messages
    expect(sess.messages.find((m) => m.content.includes('AGENTS.md'))).toBeUndefined();
    // 真 query 进了
    expect(sess.messages[0].content).toBe('实际 query');
    // title 不会命中 AGENTS.md, 而是 "实际 query"
    expect(sess.title).toBe('实际 query');
  });

  it('session_meta 缺失 → fallback 到 basename', async () => {
    const lines = [
      JSON.stringify({
        timestamp: '2026-04-20T04:35:00Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'no meta' },
      }),
    ];
    await fsp.writeFile(tmpFile, lines.join('\n') + '\n');
    const sess = await _parseCodexJsonl(tmpFile);
    expect(sess.id).toBe('test-uuid-1234');
  });
});

describe('CodexDetectorImpl — basic behavior', () => {
  it('isInstalled: bundlePath 存在 → true', () => {
    const d = new CodexDetectorImpl({ bundlePath: '/nonexistent-path-xyz', sessionsDir: '/also-nonexistent' });
    expect(d.isInstalled()).toBe(false);
  });

  it('readSession(id) id 空 → throw TypeError', async () => {
    const d = new CodexDetectorImpl();
    await expect(d.readSession('')).rejects.toThrow(TypeError);
  });

  it('listSessions: sessionsDir 不存在 → []', async () => {
    const d = new CodexDetectorImpl({ sessionsDir: '/nonexistent-codex-dir-xyz' });
    expect(await d.listSessions()).toEqual([]);
  });

  it('listSessions: 1 JSONL → 1 meta (rev2: 不切 topic)', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-detector-'));
    const file = path.join(tmpDir, 'rollout-2026-04-20T12-34-30-det-uuid-aaaa.jsonl');
    const lines = [
      JSON.stringify({
        timestamp: '2026-04-20T04:30:00Z',
        type: 'session_meta',
        payload: { id: 'det-uuid-aaaa' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:30:00Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'first query' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T05:00:00Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'second query' },
      }),
    ];
    await fsp.writeFile(file, lines.join('\n') + '\n');

    const d = new CodexDetectorImpl({ sessionsDir: tmpDir });
    const metas = await d.listSessions();
    expect(metas.length).toBe(1);
    expect(metas[0].id).toBe('det-uuid-aaaa');
    expect(metas[0].file).toBe(file);
    expect(metas[0].mtimeMs).toBeGreaterThan(0);
  });

  it('listSessions: 多个 JSONL → 多个 meta', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-multifiles-'));
    const file1 = path.join(tmpDir, 'rollout-2026-04-20T12-34-30-uuid-1111.jsonl');
    const file2 = path.join(tmpDir, 'rollout-2026-04-20T13-00-00-uuid-2222.jsonl');
    const lines = JSON.stringify({
      timestamp: '2026-04-20T04:30:00Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'hello' },
    });
    await fsp.writeFile(file1, lines + '\n');
    await fsp.writeFile(file2, lines + '\n');

    const d = new CodexDetectorImpl({ sessionsDir: tmpDir });
    const metas = await d.listSessions();
    expect(metas.length).toBe(2);
    const ids = metas.map((m) => m.id).sort();
    expect(ids).toEqual(['uuid-1111', 'uuid-2222']);
  });

  it('readSession(uuid) → 返整个 JSONL session (含多轮对话)', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-readmulti-'));
    const file = path.join(tmpDir, 'rollout-2026-04-20T12-34-30-rs-uuid-bbbb.jsonl');
    const lines = [
      JSON.stringify({
        timestamp: '2026-04-20T04:30:00Z',
        type: 'session_meta',
        payload: { id: 'rs-uuid-bbbb' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:30:00Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: '第一个问题' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:31:00Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: '回答 1' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T05:00:00Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: '追问' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T05:01:00Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: '回答 2' },
      }),
    ];
    await fsp.writeFile(file, lines.join('\n') + '\n');

    const d = new CodexDetectorImpl({ sessionsDir: tmpDir });
    const sess = await d.readSession('rs-uuid-bbbb');
    expect(sess.id).toBe('rs-uuid-bbbb');
    // 整个对话 (2 user + 2 assistant) = 4 messages
    expect(sess.messages.length).toBe(4);
    expect(sess.messages[0].content).toBe('第一个问题');
    expect(sess.messages[3].content).toBe('回答 2');
    // title 用第一条 user
    expect(sess.title).toContain('第一个问题');
  });

  it('readSession 不存在的 id → throw', async () => {
    const d = new CodexDetectorImpl({ sessionsDir: '/nonexistent-dir-xyz' });
    await expect(d.readSession('nonexistent-uuid')).rejects.toThrow(/file not found/);
  });
});