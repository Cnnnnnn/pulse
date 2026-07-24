/**
 * tests/main/bulk-upgrade.test.js
 *
 * runBulkUpgrade: 顺序执行器 — happy / 部分失败 / 超时 / 取消 / 混合源.
 * 注入 mock exec 避免真实 brew/shell 调用.
 */
import { describe, it, expect, vi } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { runBulkUpgrade } = requireMain('bulk-upgrade');
// 简易 helper: mock exec, 按 action 路由到 stub
function makeExecStub(map = {}) {
  const calls = [];
  return {
    calls,
    exec: vi.fn((action) => {
      calls.push(action);
      const stub = map[actionKey(action)];
      if (!stub) {
        return Promise.reject(new Error(`no stub for ${actionKey(action)}`));
      }
      if (stub.reject) {
        const e = new Error(stub.message || 'exec failed');
        e.output = stub.output || '';
        return Promise.reject(e);
      }
      return Promise.resolve({ output: stub.output || `done ${actionKey(action)}` });
    }),
  };
}

function actionKey(a) {
  if (a.type === 'brew') return `brew:${a.args.slice(-1)[0]}`;
  if (a.type === 'open') return `open:${a.path}`;
  if (a.type === 'open_url') return `open_url:${a.url}`;
  if (a.type === 'mas') return `mas:${a.trackId}`;
  return `none`;
}

describe('runBulkUpgrade', () => {
  it('happy path: 3 app 全成功', async () => {
    const stub = makeExecStub({
      'brew:cursor': {},
      'brew:kimi': {},
      'open:/Applications/CodexBar.app': {},
    });
    const events = [];
    const r = await runBulkUpgrade({
      items: [
        { id: 'cursor', name: 'Cursor', source: 'brew_formulae', cask: 'cursor' },
        { id: 'kimi', name: 'Kimi', source: 'brew_formulae', cask: 'kimi' },
        { id: 'codexbar', name: 'CodexBar', source: 'sparkle_appcast' },
      ],
      onProgress: (e) => events.push(e),
      exec: stub.exec,
    });
    expect(r.succeeded.map((s) => s.id)).toEqual(['cursor', 'kimi', 'codexbar']);
    expect(r.failed).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.cancelled).toBe(false);
    expect(stub.exec).toHaveBeenCalledTimes(3);
  });

  it('部分失败: 继续后面, 汇总正确', async () => {
    const stub = makeExecStub({
      'brew:cursor': {},
      'brew:kimi': { reject: true, message: 'Cask not installed' },
      'brew:cc-switch': {},
    });
    const r = await runBulkUpgrade({
      items: [
        { id: 'cursor', source: 'brew_formulae', cask: 'cursor' },
        { id: 'kimi', source: 'brew_formulae', cask: 'kimi' },
        { id: 'cc-switch', source: 'brew_formulae', cask: 'cc-switch' },
      ],
      exec: stub.exec,
    });
    expect(r.succeeded.map((s) => s.id)).toEqual(['cursor', 'cc-switch']);
    expect(r.failed).toEqual([expect.objectContaining({ id: 'kimi', error: 'Cask not installed' })]);
    expect(r.skipped).toEqual([]);
  });

  it('none action 跳过 (redirect_filename / cursor_redirect)', async () => {
    const stub = makeExecStub({});
    const r = await runBulkUpgrade({
      items: [
        { id: 'kimi', source: 'redirect_filename' },
        { id: 'cursor', source: 'cursor_redirect' },
      ],
      exec: stub.exec,
    });
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped[0]).toMatchObject({ id: 'kimi', reason: expect.stringContaining('redirect_filename') });
    expect(r.succeeded).toEqual([]);
    expect(stub.exec).not.toHaveBeenCalled();
  });

  it('空 list → 立即 done', async () => {
    const stub = makeExecStub({});
    const r = await runBulkUpgrade({ items: [], exec: stub.exec });
    expect(r).toEqual({ succeeded: [], failed: [], skipped: [], cancelled: false });
  });

  it('取消: 跑到第 2 个时 abort, 第 1 done / 第 2 cancelled (未跑)', async () => {
    const stub = makeExecStub({
      'brew:cursor': {},
      'brew:kimi': {},
    });
    const ctrl = new AbortController();
    // 第 1 个开始时 abort
    const events = [];
    const orig = stub.exec;
    stub.exec = vi.fn((action) => {
      if (action.args[action.args.length - 1] === 'kimi') {
        ctrl.abort(); // 在第 1 个成功之后, 第 2 个跑之前 abort
      }
      return orig(action);
    });

    const r = await runBulkUpgrade({
      items: [
        { id: 'cursor', source: 'brew_formulae', cask: 'cursor' },
        { id: 'kimi', source: 'brew_formulae', cask: 'kimi' },
        { id: 'cc-switch', source: 'brew_formulae', cask: 'cc-switch' },
      ],
      exec: stub.exec,
      signal: ctrl.signal,
      onProgress: (e) => events.push(e),
    });

    // cursor 应该 done, kimi 在 abort 前开始 (但因为我们 abort 在 kimi 跑之前, 它可能不会跑)
    // 关键: cancelled=true
    expect(r.cancelled).toBe(true);
    expect(r.succeeded.find((s) => s.id === 'cursor')).toBeTruthy();
    expect(r.succeeded.find((s) => s.id === 'kimi')).toBeFalsy();
  });

  it('signal 提前 aborted → 立即停', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const stub = makeExecStub({});
    const r = await runBulkUpgrade({
      items: [{ id: 'cursor', source: 'brew_formulae', cask: 'cursor' }],
      exec: stub.exec,
      signal: ctrl.signal,
    });
    expect(r.cancelled).toBe(true);
    expect(r.succeeded).toEqual([]);
    expect(stub.exec).not.toHaveBeenCalled();
  });

  it('per-item 超时 (1s) → 标 failed', async () => {
    // mock exec 永远 pending
    const slowExec = () => new Promise(() => {}); // never resolves
    const r = await runBulkUpgrade({
      items: [{ id: 'cursor', source: 'brew_formulae', cask: 'cursor' }],
      exec: slowExec,
      perItemTimeoutMs: 50, // 50ms
    });
    expect(r.failed).toEqual([
      expect.objectContaining({ id: 'cursor', error: expect.stringContaining('timeout') }),
    ]);
  });

  it('progress 事件顺序: running → done', async () => {
    const stub = makeExecStub({ 'brew:cursor': {} });
    const events = [];
    await runBulkUpgrade({
      items: [{ id: 'cursor', source: 'brew_formulae', cask: 'cursor' }],
      exec: stub.exec,
      onProgress: (e) => events.push(e),
    });
    expect(events.map((e) => e.status)).toEqual(['running', 'done']);
    expect(events[0]).toMatchObject({ id: 'cursor', status: 'running', action: 'brew' });
    expect(events[1]).toMatchObject({ id: 'cursor', status: 'done', action: 'brew' });
    expect(typeof events[1].durationMs).toBe('number');
  });

  it('progress 事件顺序: running → failed (含 error + output)', async () => {
    const stub = makeExecStub({
      'brew:kimi': { reject: true, message: 'Cask kimi not installed', output: 'Error: cask not found' },
    });
    const events = [];
    await runBulkUpgrade({
      items: [{ id: 'kimi', source: 'brew_formulae', cask: 'kimi' }],
      exec: stub.exec,
      onProgress: (e) => events.push(e),
    });
    expect(events.map((e) => e.status)).toEqual(['running', 'failed']);
    expect(events[1]).toMatchObject({
      id: 'kimi',
      status: 'failed',
      error: 'Cask kimi not installed',
      output: 'Error: cask not found',
    });
  });

  it('混合源: brew + open + open_url + mas + none', async () => {
    const stub = makeExecStub({
      'brew:cursor': {},
      'open:/Applications/CodexBar.app': {},
      'open_url:https://example.com/codex.zip': {},
      'mas:6737188438': {},
    });
    const r = await runBulkUpgrade({
      items: [
        { id: 'cursor', name: 'Cursor', source: 'brew_formulae', cask: 'cursor' },
        { id: 'codexbar', name: 'CodexBar', source: 'sparkle_appcast' }, // no releaseUrl → open
        { id: 'codex', name: 'Codex', source: 'sparkle_appcast', releaseUrl: 'https://example.com/codex.zip' }, // open_url
        { id: 'ima', name: 'IMA', source: 'app_store_lookup', trackId: 6737188438 },
        { id: 'kimi', name: 'Kimi', source: 'redirect_filename' }, // none
      ],
      exec: stub.exec,
    });
    expect(r.succeeded.map((s) => s.id)).toEqual(['cursor', 'codexbar', 'codex', 'ima']);
    expect(r.skipped).toEqual([expect.objectContaining({ id: 'kimi' })]);
  });

  it('onProgress 抛错不影响主流程', async () => {
    const stub = makeExecStub({ 'brew:cursor': {} });
    const r = await runBulkUpgrade({
      items: [{ id: 'cursor', source: 'brew_formulae', cask: 'cursor' }],
      exec: stub.exec,
      onProgress: () => { throw new Error('listener broke'); },
    });
    expect(r.succeeded).toEqual([expect.objectContaining({ id: 'cursor' })]);
  });

  it('exec 抛 unexpected 错误也被 catch', async () => {
    const stub = makeExecStub({});
    const r = await runBulkUpgrade({
      items: [{ id: 'cursor', source: 'brew_formulae', cask: 'cursor' }],
      exec: () => Promise.reject(new Error('boom')),
    });
    expect(r.failed).toEqual([
      expect.objectContaining({ id: 'cursor', error: 'boom' }),
    ]);
  });

  it('duration 正确测量', async () => {
    const stub = makeExecStub({ 'brew:cursor': {} });
    // 让 exec 慢 50ms
    stub.exec = vi.fn(async (action) => {
      await new Promise((r) => setTimeout(r, 50));
      return { output: 'ok' };
    });
    const r = await runBulkUpgrade({
      items: [{ id: 'cursor', source: 'brew_formulae', cask: 'cursor' }],
      exec: stub.exec,
    });
    expect(r.succeeded[0].durationMs).toBeGreaterThanOrEqual(45);
  });
});
