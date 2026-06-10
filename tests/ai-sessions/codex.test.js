/**
 * tests/ai-sessions/codex.test.js
 *
 * CodexDetectorImpl 测试 — 适配 2026-06-10 redesign:
 *   _parseCodexJsonl 返 { originalUuid, workspaceDir, filePath, subSessions }
 *   每个 sub-session = { id, startedAt, endedAt, messages, title }
 *
 * 覆盖:
 *   - _idFromFilename: 从 rollout-YYYY-MM-DDTHH-MM-SS-<uuid>.jsonl 抽出 uuid
 *   - _extractResponseContent: 抽 input_text parts 拼成单字符串
 *   - _extractCodexTitle: 跳 AGENTS.md / 路径 / URL / XML 标签, 命中真 user_query
 *   - _splitByUserMessage: 按 user_message 切 sub-session
 *   - _parseCodexJsonl: 解析整个 JSONL → 多个 sub-session
 *   - DetectorImpl.isInstalled() / listSessions() / readSession() (mocked fs)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CodexDetectorImpl,
  _parseCodexJsonl,
  _splitByUserMessage,
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
});

describe('codex._splitByUserMessage — topic splitting', () => {
  it('0 user → 1 stub sub-session', () => {
    const subs = _splitByUserMessage([
      { kind: 'assistant', content: 'only assistant', ts: 1000 },
      { kind: 'assistant', content: 'another', ts: 2000 },
    ], 'uuid-xyz');
    expect(subs.length).toBe(1);
    expect(subs[0].id).toBe('uuid-xyz#topic-0');
    expect(subs[0].messages.length).toBe(2);
    expect(subs[0].startedAt).toBe(1000);
    expect(subs[0].endedAt).toBe(2000);
  });

  it('1 user + N assistant → 1 sub-session', () => {
    const subs = _splitByUserMessage([
      { kind: 'user', content: 'first query', ts: 1000 },
      { kind: 'assistant', content: 'reply 1', ts: 1500 },
      { kind: 'assistant', content: 'reply 2', ts: 2000 },
    ], 'uuid-abc');
    expect(subs.length).toBe(1);
    expect(subs[0].messages.length).toBe(3);
    expect(subs[0].messages[0].role).toBe('user');
    expect(subs[0].messages[1].role).toBe('assistant');
  });

  it('3 user → 3 sub-session', () => {
    const subs = _splitByUserMessage([
      { kind: 'user', content: 'Q1', ts: 1000 },
      { kind: 'assistant', content: 'A1', ts: 1500 },
      { kind: 'user', content: 'Q2', ts: 2000 },
      { kind: 'assistant', content: 'A2', ts: 2500 },
      { kind: 'user', content: 'Q3', ts: 3000 },
      { kind: 'assistant', content: 'A3', ts: 3500 },
    ], 'uuid-multi');
    expect(subs.length).toBe(3);
    expect(subs.map((s) => s.id)).toEqual([
      'uuid-multi#topic-0',
      'uuid-multi#topic-1',
      'uuid-multi#topic-2',
    ]);
    expect(subs[0].messages.map((m) => m.content)).toEqual(['Q1', 'A1']);
    expect(subs[1].messages.map((m) => m.content)).toEqual(['Q2', 'A2']);
    expect(subs[2].messages.map((m) => m.content)).toEqual(['Q3', 'A3']);
    // 时间窗准确
    expect(subs[0].startedAt).toBe(1000);
    expect(subs[0].endedAt).toBe(1500);
    expect(subs[1].startedAt).toBe(2000);
    expect(subs[1].endedAt).toBe(2500);
  });

  it('重复 user_message (retry) → 2 sub-session (不去重, 保留历史)', () => {
    const subs = _splitByUserMessage([
      { kind: 'user', content: '一样的问题', ts: 1000 },
      { kind: 'assistant', content: '答 1', ts: 1500 },
      { kind: 'user', content: '一样的问题', ts: 2000 },
      { kind: 'assistant', content: '答 2', ts: 2500 },
    ], 'uuid-retry');
    expect(subs.length).toBe(2);
  });

  it('assistant 在 user 之前 → 挂到第一个 stub (不会丢消息)', () => {
    const subs = _splitByUserMessage([
      { kind: 'assistant', content: 'prefill', ts: 500 },
      { kind: 'user', content: 'real Q', ts: 1000 },
      { kind: 'assistant', content: 'reply', ts: 1500 },
    ], 'uuid-pre');
    expect(subs.length).toBe(1);
    expect(subs[0].messages.length).toBe(3);
    expect(subs[0].messages[0].content).toBe('prefill');
    expect(subs[0].messages[1].content).toBe('real Q');
    expect(subs[0].startedAt).toBe(500);
  });

  it('空 events → 1 stub 空 sub-session', () => {
    const subs = _splitByUserMessage([], 'uuid-empty');
    expect(subs.length).toBe(1);
    expect(subs[0].messages).toEqual([]);
    expect(subs[0].startedAt).toBe(0);
    expect(subs[0].endedAt).toBe(0);
  });

  it('乱序 ts → 排序后再切', () => {
    const subs = _splitByUserMessage([
      { kind: 'user', content: 'Q2', ts: 2000 },
      { kind: 'assistant', content: 'A1', ts: 1500 },  // 实际在 Q1 之后
      { kind: 'user', content: 'Q1', ts: 1000 },
      { kind: 'assistant', content: 'A2', ts: 2500 },
    ], 'uuid-order');
    expect(subs.length).toBe(2);
    expect(subs[0].messages.map((m) => m.content)).toEqual(['Q1', 'A1']);
    expect(subs[1].messages.map((m) => m.content)).toEqual(['Q2', 'A2']);
  });
});

describe('codex._parseCodexJsonl — stream parse', () => {
  let tmpDir;
  let tmpFile;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-test-'));
    tmpFile = path.join(tmpDir, 'rollout-2026-04-20T12-34-30-test-uuid-1234.jsonl');
  });

  it('解析 session_meta + response_item → 1 sub-session', async () => {
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
      // event_msg.user_message → 真用户 query (切分点)
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

    const r = await _parseCodexJsonl(tmpFile);
    expect(r.originalUuid).toBe('test-uuid-1234');
    expect(r.workspaceDir).toBe('/Users/me/proj');
    expect(r.filePath).toBe(tmpFile);
    expect(r.subSessions.length).toBe(1);
    const sub = r.subSessions[0];
    expect(sub.id).toBe('test-uuid-1234#topic-0');
    expect(sub.messages.length).toBe(3);
    expect(sub.messages[0]).toMatchObject({ role: 'user', content: '帮我看下 ntb-cvp-limit-success' });
    expect(sub.messages[1].content).toBe('好的, 让我先看...');
    expect(sub.messages[2].content).toBe('分析结果...');
    expect(sub.title).toBe('帮我看下 ntb-cvp-limit-success');
    expect(sub.startedAt).toBeLessThanOrEqual(sub.endedAt);
  });

  it('多 user_message → 多个 sub-session (核心场景)', async () => {
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

    const r = await _parseCodexJsonl(tmpFile);
    expect(r.subSessions.length).toBe(2);
    expect(r.subSessions[0].id).toBe('multi-uuid#topic-0');
    expect(r.subSessions[0].messages.length).toBe(2);
    expect(r.subSessions[0].title).toContain('ntb-cvp-limit-success');
    expect(r.subSessions[1].id).toBe('multi-uuid#topic-1');
    expect(r.subSessions[1].title).toContain('实现还缺乏什么');
  });

  it('空文件 → 1 stub 空 sub-session', async () => {
    await fsp.writeFile(tmpFile, '');
    const r = await _parseCodexJsonl(tmpFile);
    expect(r.originalUuid).toBe('test-uuid-1234');
    expect(r.subSessions.length).toBe(1);
    expect(r.subSessions[0].messages).toEqual([]);
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
    const r = await _parseCodexJsonl(tmpFile);
    expect(r.subSessions.length).toBe(1);
    expect(r.subSessions[0].messages[0].content).toBe('still ok');
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
    const r = await _parseCodexJsonl(tmpFile);
    expect(r.subSessions.length).toBe(1);
    // AGENTS.md 不进 messages
    expect(r.subSessions[0].messages.find((m) => m.content.includes('AGENTS.md'))).toBeUndefined();
    // 真 query 进了
    expect(r.subSessions[0].messages[0].content).toBe('实际 query');
    // title 不会命中 AGENTS.md, 而是 "实际 query"
    expect(r.subSessions[0].title).toBe('实际 query');
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
    const r = await _parseCodexJsonl(tmpFile);
    // 从 filename 抽 uuid
    expect(r.originalUuid).toBe('test-uuid-1234');
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

  it('listSessions: 多 user_message → 输出 N 个 sub-session meta', async () => {
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
    expect(metas.length).toBe(2);
    expect(metas[0].id).toBe('det-uuid-aaaa#topic-0');
    expect(metas[1].id).toBe('det-uuid-aaaa#topic-1');
    expect(metas[0].file).toBe(file);
    expect(metas[0].mtimeMs).toBeGreaterThan(0);
  });

  it('readSession("#topic-N") → 返对应 sub-session', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-readsub-'));
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
        payload: { type: 'user_message', message: 'topic A 的问题' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:31:00Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'A 回复' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T05:00:00Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'topic B 的问题' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T05:01:00Z',
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'B 回复' },
      }),
    ];
    await fsp.writeFile(file, lines.join('\n') + '\n');

    const d = new CodexDetectorImpl({ sessionsDir: tmpDir });
    await d.listSessions();  // 预热缓存
    const sub1 = await d.readSession('rs-uuid-bbbb#topic-0');
    expect(sub1.id).toBe('rs-uuid-bbbb#topic-0');
    expect(sub1.messages[0].content).toBe('topic A 的问题');
    expect(sub1.title).toContain('topic A');

    const sub2 = await d.readSession('rs-uuid-bbbb#topic-1');
    expect(sub2.id).toBe('rs-uuid-bbbb#topic-1');
    expect(sub2.messages[0].content).toBe('topic B 的问题');
    expect(sub2.title).toContain('topic B');
  });

  it('readSession 不存在的 topic index → throw', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-readbad-'));
    const file = path.join(tmpDir, 'rollout-2026-04-20T12-34-30-bad-uuid-cccc.jsonl');
    const lines = [
      JSON.stringify({
        timestamp: '2026-04-20T04:30:00Z',
        type: 'session_meta',
        payload: { id: 'bad-uuid-cccc' },
      }),
      JSON.stringify({
        timestamp: '2026-04-20T04:30:00Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'only one topic' },
      }),
    ];
    await fsp.writeFile(file, lines.join('\n') + '\n');

    const d = new CodexDetectorImpl({ sessionsDir: tmpDir });
    await d.listSessions();
    await expect(d.readSession('bad-uuid-cccc#topic-99')).rejects.toThrow(/sub-session not found/);
  });
});