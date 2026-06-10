/**
 * tests/ai-sessions/engine.test.js
 *
 * 重做版 TaskSummaryEngine.
 *
 * 覆盖:
 *   - listTasks: dateKey 校验 / 本地日过滤 / 缓存命中带 summary / hash 不匹配标 stale
 *                / detector 未安装跳过 / readSession throw 跳过 / 不调 LLM
 *   - summarizeTasks: 逐任务调 LLM + onTaskDone 回调 / 部分失败 / task_not_found
 *                     / 结果写缓存 / 空选择
 *   - _contentHash / _parsePerSessionBlock / _extractSummaryFields 纯函数
 */

import { describe, it, expect, vi } from 'vitest';
import {
  TaskSummaryEngine,
  _contentHash,
  _taskKeyOf,
  _parsePerSessionBlock,
  _extractSummaryFields,
  _resolveJumpTarget,
  _projectOf,
} from '../../src/ai-sessions/engine.js';
import { AISessionDetector } from '../../src/ai-sessions/detector.js';

const DAY = '2026-06-08';
// 2026-06-08 12:00 本地时间 (测试环境时区无所谓, 用本地 Date 构造)
const T = new Date(2026, 5, 8, 12, 0).getTime();

function makeSession(id, appName, overrides = {}) {
  return {
    id,
    appName,
    startedAt: T,
    endedAt: T + 600_000,
    title: `任务 ${id}`,
    workspaceDir: 'proj-x',
    messages: [
      { role: 'user', content: `请处理 ${id}`, ts: T },
      { role: 'assistant', content: '处理完了', ts: T + 1000 },
    ],
    ...overrides,
  };
}

function makeDetector({ appName = 'cursor', installed = true, sessions = [], readSessionImpl } = {}) {
  const impl = {
    appName,
    isInstalled: vi.fn(() => installed),
    listSessions: vi.fn(async () => sessions.map((s) => ({ id: s.id, file: `/tmp/${s.id}`, mtimeMs: s.endedAt || T, sizeBytes: 10 }))),
    readSession: readSessionImpl || vi.fn(async (id) => {
      const s = sessions.find((x) => x.id === id);
      if (!s) throw new Error('not found');
      return s;
    }),
  };
  return new AISessionDetector({ appName, impl });
}

function makeSummarizer({ impl } = {}) {
  return {
    provider: 'deepseek',
    model: 'deepseek-chat',
    summarize: impl || vi.fn(async () => '### Session 1: 测试标题\n- 用户诉求：做某事\n- 处理结果：做完了'),
  };
}

function makeStorage(initial = {}) {
  const map = { ...initial };
  return {
    map,
    loadTaskSummaries: vi.fn(() => ({ ...map })),
    saveTaskSummary: vi.fn((entry) => { map[entry.taskKey] = entry; }),
  };
}

function makeEngine({ detectors, summarizer, storage } = {}) {
  return new TaskSummaryEngine({
    detectors: detectors || [makeDetector({ sessions: [makeSession('s1', 'cursor')] })],
    summarizer: summarizer || makeSummarizer(),
    storage: storage || makeStorage(),
    config: { locale: 'zh-CN' },
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });
}

describe('TaskSummaryEngine — 构造校验', () => {
  it('detectors / summarizer / storage 必填', () => {
    expect(() => new TaskSummaryEngine({})).toThrow(TypeError);
    expect(() => new TaskSummaryEngine({ detectors: [], summarizer: makeSummarizer() })).toThrow(TypeError);
    expect(() => new TaskSummaryEngine({ detectors: [], summarizer: makeSummarizer(), storage: makeStorage() })).not.toThrow();
  });
});

describe('TaskSummaryEngine — listTasks', () => {
  it('dateKey 非法 → TypeError', async () => {
    const e = makeEngine();
    await expect(e.listTasks('bad')).rejects.toThrow(TypeError);
    await expect(e.listTasks(null)).rejects.toThrow(TypeError);
  });

  it('返任务卡数组, 不调 summarizer', async () => {
    const summarizer = makeSummarizer();
    const e = makeEngine({ summarizer });
    const r = await e.listTasks(DAY, { now: T });
    expect(r.dateKey).toBe(DAY);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0]).toMatchObject({
      taskKey: 'cursor:s1',
      sessionId: 's1',
      appName: 'cursor',
      title: '任务 s1',
      project: 'proj-x',
      msgCount: 2,
      summary: null,
    });
    expect(summarizer.summarize).not.toHaveBeenCalled();
  });

  it('按本地日过滤: 不在 dateKey 的任务不返', async () => {
    const otherDay = makeSession('old', 'cursor', {
      startedAt: T - 5 * 86400_000,
      endedAt: T - 5 * 86400_000 + 1000,
    });
    const det = makeDetector({ sessions: [makeSession('s1', 'cursor'), otherDay] });
    const e = makeEngine({ detectors: [det] });
    const r = await e.listTasks(DAY, { now: T });
    expect(r.tasks.map((t) => t.sessionId)).toEqual(['s1']);
  });

  it('detector 未安装 → 跳过 + sourceStats 记录', async () => {
    const det = makeDetector({ appName: 'codex', installed: false });
    const e = makeEngine({ detectors: [det] });
    const r = await e.listTasks(DAY, { now: T });
    expect(r.tasks).toEqual([]);
    expect(r.sourceStats).toEqual([{ appName: 'codex', installed: false, metaCount: 0, matchedCount: 0 }]);
  });

  it('readSession throw → 跳过该任务, 其它正常', async () => {
    const sessions = [makeSession('ok', 'cursor'), makeSession('boom', 'cursor')];
    const det = makeDetector({
      sessions,
      readSessionImpl: vi.fn(async (id) => {
        if (id === 'boom') throw new Error('corrupt');
        return sessions.find((x) => x.id === id);
      }),
    });
    const e = makeEngine({ detectors: [det] });
    const r = await e.listTasks(DAY, { now: T });
    expect(r.tasks.map((t) => t.sessionId)).toEqual(['ok']);
  });

  it('缓存命中 → 任务卡带 summary; hash 一致 → stale=false', async () => {
    const session = makeSession('s1', 'cursor');
    const hash = _contentHash(session);
    const storage = makeStorage({
      'cursor:s1': {
        taskKey: 'cursor:s1', title: '缓存标题', userGoal: '目标', outcome: '结果',
        provider: 'deepseek', model: 'deepseek-chat', generatedAt: T, contentHash: hash,
      },
    });
    const e = makeEngine({ detectors: [makeDetector({ sessions: [session] })], storage });
    const r = await e.listTasks(DAY, { now: T });
    expect(r.tasks[0].summary).toMatchObject({
      title: '缓存标题', userGoal: '目标', outcome: '结果', stale: false,
    });
  });

  it('内容变了 (hash 不匹配) → summary.stale=true', async () => {
    const session = makeSession('s1', 'cursor');
    const storage = makeStorage({
      'cursor:s1': { taskKey: 'cursor:s1', title: 'x', generatedAt: T, contentHash: 'stale-hash' },
    });
    const e = makeEngine({ detectors: [makeDetector({ sessions: [session] })], storage });
    const r = await e.listTasks(DAY, { now: T });
    expect(r.tasks[0].summary.stale).toBe(true);
  });

  it('多 detector 合并 + 按 startedAt 排序', async () => {
    const d1 = makeDetector({ appName: 'cursor', sessions: [makeSession('b', 'cursor', { startedAt: T + 3600_000 })] });
    const d2 = makeDetector({ appName: 'codex', sessions: [makeSession('a', 'codex', { startedAt: T })] });
    const e = makeEngine({ detectors: [d1, d2] });
    const r = await e.listTasks(DAY, { now: T });
    expect(r.tasks.map((t) => t.taskKey)).toEqual(['codex:a', 'cursor:b']);
  });
});

describe('TaskSummaryEngine — summarizeTasks', () => {
  it('空选择 → ok=false + no_tasks_selected', async () => {
    const e = makeEngine();
    const r = await e.summarizeTasks([], { dateKey: DAY, now: T });
    expect(r.ok).toBe(false);
    expect(r.failures[0].message).toBe('no_tasks_selected');
  });

  it('成功: 调 LLM → 写缓存 + onTaskDone 回调 + 返带 summary 的任务卡', async () => {
    const storage = makeStorage();
    const summarizer = makeSummarizer();
    const e = makeEngine({ storage, summarizer });
    const events = [];
    const r = await e.summarizeTasks(['cursor:s1'], {
      dateKey: DAY, now: T,
      onTaskDone: (ev) => events.push(ev),
    });

    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].summary).toMatchObject({
      title: '测试标题', userGoal: '做某事', outcome: '做完了', stale: false,
    });
    // 缓存写入
    expect(storage.saveTaskSummary).toHaveBeenCalledTimes(1);
    expect(storage.map['cursor:s1']).toMatchObject({
      taskKey: 'cursor:s1', title: '测试标题', provider: 'deepseek', model: 'deepseek-chat',
    });
    // 回调
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ taskKey: 'cursor:s1', ok: true });
    // perSession 模式
    expect(summarizer.summarize).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ perSession: true, dateKey: DAY }),
    );
  });

  it('部分失败: 一个成功一个 throw → ok=false, 但成功的照样写缓存 + 回调', async () => {
    const sessions = [makeSession('good', 'cursor'), makeSession('bad', 'cursor')];
    const det = makeDetector({ sessions });
    const storage = makeStorage();
    const summarize = vi.fn(async ([s]) => {
      if (s.id === 'bad') throw new Error('llm_500');
      return '### Session 1: 好的\n- 用户诉求：a\n- 处理结果：b';
    });
    const e = makeEngine({ detectors: [det], storage, summarizer: makeSummarizer({ impl: summarize }) });
    const events = [];
    const r = await e.summarizeTasks(['cursor:good', 'cursor:bad'], {
      dateKey: DAY, now: T, onTaskDone: (ev) => events.push(ev),
    });

    expect(r.ok).toBe(false);
    expect(r.results).toHaveLength(1);
    expect(r.failures).toEqual([{ taskKey: 'cursor:bad', message: 'llm_500' }]);
    expect(storage.map['cursor:good']).toBeDefined();
    expect(storage.map['cursor:bad']).toBeUndefined();
    expect(events.map((e2) => e2.ok)).toEqual([true, false]);
  });

  it('选了当天不存在的任务 → task_not_found', async () => {
    const e = makeEngine();
    const events = [];
    const r = await e.summarizeTasks(['cursor:ghost'], {
      dateKey: DAY, now: T, onTaskDone: (ev) => events.push(ev),
    });
    expect(r.ok).toBe(false);
    expect(r.failures).toEqual([{ taskKey: 'cursor:ghost', message: 'task_not_found' }]);
    expect(events[0]).toMatchObject({ taskKey: 'cursor:ghost', ok: false, error: 'task_not_found' });
  });
});

describe('engine 纯函数', () => {
  it('_contentHash: 消息一样 → hash 一样; 变了 → 不一样', () => {
    const a = makeSession('x', 'cursor');
    const b = makeSession('x', 'cursor');
    expect(_contentHash(a)).toBe(_contentHash(b));
    b.messages = [...b.messages, { role: 'user', content: '新消息', ts: T }];
    expect(_contentHash(a)).not.toBe(_contentHash(b));
  });

  it('_taskKeyOf: app:id', () => {
    expect(_taskKeyOf({ appName: 'codex', id: 'abc' })).toBe('codex:abc');
    expect(_taskKeyOf({ id: 'abc' })).toBe('unknown:abc');
  });

  it('_parsePerSessionBlock: 标准格式', () => {
    const r = _parsePerSessionBlock('### Session 1: 修复登录\n- 用户诉求：修 bug\n- 处理结果：已修复', 0);
    expect(r.title).toBe('修复登录');
    expect(r.summary).toContain('用户诉求');
  });

  it('_parsePerSessionBlock: 没 ### 标题 → 首行当标题', () => {
    const r = _parsePerSessionBlock('随便写的总结\n第二行', 2);
    expect(r.title).toBe('随便写的总结');
  });

  it('_parsePerSessionBlock: 空输入 → fallback 标题', () => {
    expect(_parsePerSessionBlock('', 0).title).toBe('任务 1');
    expect(_parsePerSessionBlock(null, 4).title).toBe('任务 5');
  });

  it('_extractSummaryFields: 标准 用户诉求/处理结果', () => {
    const r = _extractSummaryFields('- 用户诉求：想修 bug\n- 处理结果：修好了');
    expect(r).toEqual({ userGoal: '想修 bug', outcome: '修好了' });
  });

  it('_extractSummaryFields: 模型没按格式 → 兜底取行', () => {
    const r = _extractSummaryFields('第一句话。\n第二句话。');
    expect(r.userGoal).toBe('第一句话。');
    expect(r.outcome).toBe('第二句话。');
  });

  it('_resolveJumpTarget: codex/minimax scheme, cursor 用文件路径', () => {
    expect(_resolveJumpTarget({ appName: 'codex', id: 'x' })).toBe('codex://x');
    expect(_resolveJumpTarget({ appName: 'minimax-code', id: 'y' })).toBe('minimax://y');
    expect(_resolveJumpTarget({ appName: 'cursor', id: 'z', file: '/tmp/z.jsonl' })).toBe('/tmp/z.jsonl');
    expect(_resolveJumpTarget({ appName: 'cursor', id: 'z' })).toBe(null);
  });

  it('_projectOf: 绝对路径取末段, label 原样', () => {
    expect(_projectOf({ workspaceDir: '/Users/me/Desktop/proj' })).toBe('proj');
    expect(_projectOf({ workspaceDir: 'proj-label' })).toBe('proj-label');
    expect(_projectOf({})).toBe('');
  });
});
