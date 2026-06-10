/**
 * tests/ai-sessions/cursor-detector.test.js
 *
 * 重做版 CursorDetectorImpl — agent-transcripts jsonl 解析.
 *
 * 覆盖:
 *   - isInstalled (bundle / projectsDir / 都没有 / throw)
 *   - listSessions (目录缺失 → [], 嵌套 uuid 目录结构, 平铺 jsonl 容错, 空文件跳过)
 *   - readSession (jsonl 解析: user_query 提取 / timestamp 解析 / tool_use 跳过 /
 *                  title 去噪 / workspaceDir label / 坏行容错)
 *   - _parseCursorTimestamp / _extractUserQuery / _projectLabel 纯函数
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CursorDetectorImpl,
  _parseCursorTimestamp,
  _extractUserQuery,
  _projectLabel,
  _firstMeaningfulLine,
} from '../../src/ai-sessions/cursor.js';

let tmpDir;
let projectsDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-detector-test-'));
  projectsDir = path.join(tmpDir, 'projects');
  fs.mkdirSync(projectsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTranscript(projectDirName, uuid, lines) {
  const dir = path.join(projectsDir, projectDirName, 'agent-transcripts', uuid);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${uuid}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n'), 'utf-8');
  return file;
}

function userMsg(text) {
  return { role: 'user', message: { content: [{ type: 'text', text }] } };
}

function assistantMsg(blocks) {
  return { role: 'assistant', message: { content: blocks } };
}

describe('CursorDetectorImpl — isInstalled', () => {
  it('bundle 不存在但 projectsDir 存在 → true', () => {
    const d = new CursorDetectorImpl({ bundlePath: '/nonexistent/Cursor.app', projectsDir });
    expect(d.isInstalled()).toBe(true);
  });

  it('都不存在 → false', () => {
    const d = new CursorDetectorImpl({
      bundlePath: '/nonexistent/Cursor.app',
      projectsDir: path.join(tmpDir, 'missing'),
    });
    expect(d.isInstalled()).toBe(false);
  });
});

describe('CursorDetectorImpl — listSessions', () => {
  it('projectsDir 不存在 → []', async () => {
    const d = new CursorDetectorImpl({ projectsDir: path.join(tmpDir, 'missing') });
    expect(await d.listSessions()).toEqual([]);
  });

  it('一个 jsonl = 一个任务 (嵌套 uuid 目录)', async () => {
    writeTranscript('Users-me-Desktop-proj-a', 'uuid-1', [userMsg('<user_query>修 bug</user_query>')]);
    writeTranscript('Users-me-Desktop-proj-a', 'uuid-2', [userMsg('<user_query>加功能</user_query>')]);
    writeTranscript('Users-me-Desktop-proj-b', 'uuid-3', [userMsg('<user_query>重构</user_query>')]);
    const d = new CursorDetectorImpl({ projectsDir });
    const metas = await d.listSessions();
    expect(metas).toHaveLength(3);
    const ids = metas.map((m) => m.id).sort();
    expect(ids).toEqual(['uuid-1', 'uuid-2', 'uuid-3']);
    for (const m of metas) {
      expect(m.mtimeMs).toBeGreaterThan(0);
      expect(m.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('空 jsonl 文件 → 跳过', async () => {
    const dir = path.join(projectsDir, 'p1', 'agent-transcripts', 'uuid-empty');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'uuid-empty.jsonl'), '', 'utf-8');
    const d = new CursorDetectorImpl({ projectsDir });
    expect(await d.listSessions()).toEqual([]);
  });

  it('没有 agent-transcripts 的项目目录 → 跳过', async () => {
    fs.mkdirSync(path.join(projectsDir, 'no-transcripts'), { recursive: true });
    writeTranscript('with-transcripts', 'uuid-1', [userMsg('<user_query>x</user_query>')]);
    const d = new CursorDetectorImpl({ projectsDir });
    const metas = await d.listSessions();
    expect(metas).toHaveLength(1);
  });

  it('平铺 <uuid>.jsonl (老结构容错)', async () => {
    const dir = path.join(projectsDir, 'p1', 'agent-transcripts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'uuid-flat.jsonl'), JSON.stringify(userMsg('<user_query>flat</user_query>')), 'utf-8');
    const d = new CursorDetectorImpl({ projectsDir });
    const metas = await d.listSessions();
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe('uuid-flat');
  });
});

describe('CursorDetectorImpl — readSession', () => {
  it('解析 user_query + timestamp + assistant text (跳过 tool_use)', async () => {
    writeTranscript('Users-me-Desktop-proj-a', 'uuid-1', [
      userMsg('<timestamp>Monday, Jun 8, 2026, 2:20 PM (UTC+8)</timestamp>\n<user_query>\n帮我修复登录 bug\n</user_query>'),
      assistantMsg([
        { type: 'text', text: '好的, 我先看下代码。' },
        { type: 'tool_use', name: 'Read', input: { path: '/x' } },
      ]),
      userMsg('<timestamp>Monday, Jun 8, 2026, 2:35 PM (UTC+8)</timestamp>\n<user_query>\n继续\n</user_query>'),
    ]);
    const d = new CursorDetectorImpl({ projectsDir });
    await d.listSessions();
    const s = await d.readSession('uuid-1');

    expect(s.id).toBe('uuid-1');
    expect(s.title).toBe('帮我修复登录 bug');
    expect(s.workspaceDir).toBe('proj-a');
    // startedAt = 2026-06-08 14:20 UTC+8 = 06:20 UTC
    expect(s.startedAt).toBe(Date.UTC(2026, 5, 8, 6, 20));
    expect(s.endedAt).toBeGreaterThan(0);

    expect(s.messages).toHaveLength(3);
    expect(s.messages[0]).toMatchObject({ role: 'user', content: '帮我修复登录 bug' });
    expect(s.messages[0].ts).toBe(Date.UTC(2026, 5, 8, 6, 20));
    expect(s.messages[1].role).toBe('assistant');
    expect(s.messages[1].content).toBe('好的, 我先看下代码。');
    expect(s.messages[1].content).not.toContain('tool_use');
    expect(s.messages[2]).toMatchObject({ role: 'user', content: '继续' });
  });

  it('无 timestamp 标签 → startedAt fallback 文件 birthtime', async () => {
    writeTranscript('p1', 'uuid-nt', [userMsg('<user_query>无时间戳任务</user_query>')]);
    const d = new CursorDetectorImpl({ projectsDir });
    await d.listSessions();
    const s = await d.readSession('uuid-nt');
    expect(s.startedAt).toBeGreaterThan(0);
    expect(s.title).toBe('无时间戳任务');
  });

  it('纯系统注入的 user 行 (无 user_query, 全是标签) → 不算消息', async () => {
    writeTranscript('p1', 'uuid-sys', [
      userMsg('<system_reminder>internal stuff</system_reminder>'),
      userMsg('<user_query>真正的问题</user_query>'),
    ]);
    const d = new CursorDetectorImpl({ projectsDir });
    await d.listSessions();
    const s = await d.readSession('uuid-sys');
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].content).toBe('真正的问题');
    expect(s.title).toBe('真正的问题');
  });

  it('坏 JSON 行 → 跳过不 throw', async () => {
    writeTranscript('p1', 'uuid-bad', [
      'this is not json {{{',
      userMsg('<user_query>有效消息</user_query>'),
    ]);
    const d = new CursorDetectorImpl({ projectsDir });
    await d.listSessions();
    const s = await d.readSession('uuid-bad');
    expect(s.messages).toHaveLength(1);
  });

  it('没经过 listSessions 直接 readSession → 自动重扫', async () => {
    writeTranscript('p1', 'uuid-direct', [userMsg('<user_query>直接读</user_query>')]);
    const d = new CursorDetectorImpl({ projectsDir });
    const s = await d.readSession('uuid-direct');
    expect(s.id).toBe('uuid-direct');
  });

  it('不存在的 id → throw', async () => {
    const d = new CursorDetectorImpl({ projectsDir });
    await expect(d.readSession('nope')).rejects.toThrow(/not found/);
  });

  it('id 校验: 空 → TypeError', async () => {
    const d = new CursorDetectorImpl({ projectsDir });
    await expect(d.readSession('')).rejects.toThrow(TypeError);
  });
});

describe('_parseCursorTimestamp (纯函数)', () => {
  it('标准格式: Monday, Jun 8, 2026, 2:20 PM (UTC+8)', () => {
    expect(_parseCursorTimestamp('Monday, Jun 8, 2026, 2:20 PM (UTC+8)'))
      .toBe(Date.UTC(2026, 5, 8, 6, 20));
  });

  it('AM / 12 小时制边界: 12:05 AM = 00:05', () => {
    expect(_parseCursorTimestamp('Tuesday, Jan 1, 2026, 12:05 AM (UTC+0)'))
      .toBe(Date.UTC(2026, 0, 1, 0, 5));
  });

  it('12 PM = 中午 12 点', () => {
    expect(_parseCursorTimestamp('Tuesday, Jan 1, 2026, 12:00 PM (UTC+0)'))
      .toBe(Date.UTC(2026, 0, 1, 12, 0));
  });

  it('负时区: UTC-5', () => {
    expect(_parseCursorTimestamp('Wednesday, Mar 4, 2026, 3:00 PM (UTC-5)'))
      .toBe(Date.UTC(2026, 2, 4, 20, 0));
  });

  it('解析不了 → 0', () => {
    expect(_parseCursorTimestamp('garbage')).toBe(0);
    expect(_parseCursorTimestamp('')).toBe(0);
    expect(_parseCursorTimestamp(null)).toBe(0);
  });
});

describe('_extractUserQuery (纯函数)', () => {
  it('抽 user_query 标签内文', () => {
    expect(_extractUserQuery('<timestamp>x</timestamp>\n<user_query>\n你好\n</user_query>')).toBe('你好');
  });

  it('多个 user_query → 合并', () => {
    expect(_extractUserQuery('<user_query>a</user_query><user_query>b</user_query>')).toBe('a\nb');
  });

  it('无标签 → 去掉系统标签后返回剩余文本', () => {
    expect(_extractUserQuery('<timestamp>x</timestamp>\n直接输入的内容')).toBe('直接输入的内容');
  });

  it('整段都是系统标签 → 空', () => {
    expect(_extractUserQuery('<system_reminder>internal</system_reminder>')).toBe('');
    expect(_extractUserQuery('<attached_files>f</attached_files>')).toBe('');
  });
});

describe('_projectLabel (纯函数)', () => {
  it('Users-xxx-Desktop-yyy → yyy', () => {
    expect(_projectLabel('Users-shien-liang-Desktop-pj2026-admin')).toBe('pj2026-admin');
  });

  it('Users-xxx (home 目录) → ~', () => {
    expect(_projectLabel('Users-shien-liang')).toBe('~');
  });

  it('纯数字临时目录 → 空', () => {
    expect(_projectLabel('1777109260121')).toBe('');
  });

  it('普通名字 → 原样', () => {
    expect(_projectLabel('empty-window')).toBe('empty-window');
  });
});

describe('_firstMeaningfulLine (纯函数)', () => {
  it('跳过 markdown 标题 / 路径 / URL', () => {
    expect(_firstMeaningfulLine('# 标题\n/Users/me/x\nhttps://a.com\n真正内容')).toBe('真正内容');
  });

  it('全是噪声 → null', () => {
    expect(_firstMeaningfulLine('# only heading')).toBe(null);
  });
});
