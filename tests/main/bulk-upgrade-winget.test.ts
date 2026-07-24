/**
 * tests/main/bulk-upgrade-winget.test.js
 *
 * P3: winget_show source → winget action. 镜像 brew_formulae 的形态.
 * 跟 bulk-upgrade-actions.test.js 的 brew 用例同构.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const { getActionForApp } = requireMain('bulk-upgrade-actions');
import { EventEmitter } from 'node:events';
import childProcess from 'node:child_process';
const { defaultExec } = requireMain('bulk-upgrade');
// Build a fresh EventEmitter-based stub child that emits 'close' on next tick.
function makeStubChild(exitCode = 0) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => child.emit('close', exitCode, null));
  return child;
}

// Spy on the real childProcess.execFile so defaultExec sees the mock.
// bulk-upgrade.js invokes `childProcess.execFile(...)` (property access), not
// a destructured local, so a vi.spyOn on the module's execFile property
// intercepts every call site.

describe('getActionForApp — winget source (P3)', () => {
  it('winget_show + winget_id → winget action', () => {
    const r = getActionForApp({
      id: 'cursor', name: 'Cursor', source: 'winget_show',
      current: '3.6.31', latest: '3.7.12',
      wingetId: 'Anysphere.Cursor',
    });
    expect(r).toEqual({
      type: 'winget',
      id: 'Anysphere.Cursor',
    });
  });

  it('winget_show 缺 wingetId → none', () => {
    const r = getActionForApp({
      id: 'x', name: 'X', source: 'winget_show',
      current: '1', latest: '2',
    });
    expect(r).toEqual({ type: 'none', reason: 'winget: missing id' });
  });

  it('winget_show 接受 winget_id (snake_case) 字段 (renderer 可能两种命名都传)', () => {
    const r = getActionForApp({
      id: 'code', name: 'Code', source: 'winget_show',
      winget_id: 'OpenAI.Codex',
    });
    expect(r.type).toBe('winget');
    expect(r.id).toBe('OpenAI.Codex');
  });

  it('null item → none (回归)', () => {
    expect(getActionForApp(null)).toEqual({ type: 'none', reason: 'invalid item' });
  });
});

describe('defaultExec — winget action (P3)', () => {
  let execFileSpy;

  beforeEach(() => {
    execFileSpy = vi.spyOn(childProcess, 'execFile');
  });

  afterEach(() => {
    execFileSpy.mockRestore();
  });

  it('winget action → execFile("winget", ["upgrade", "--id", id, ...])', async () => {
    execFileSpy.mockImplementation(() => makeStubChild(0));

    const result = await defaultExec({ type: 'winget', id: 'Anysphere.Cursor' });

    expect(execFileSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = execFileSpy.mock.calls[0];
    expect(cmd).toBe('winget');
    // plan: `winget upgrade --id <id> --accept-package-agreements --accept-source-agreements`
    expect(args).toContain('--id');
    expect(args).toContain('Anysphere.Cursor');
    expect(args).toContain('--accept-package-agreements');
    expect(args).toContain('--accept-source-agreements');
    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });

  it('winget action exit non-zero → ok:false, exitCode preserved', async () => {
    execFileSpy.mockImplementation(() => makeStubChild(1603)); // winget error code

    const result = await defaultExec({ type: 'winget', id: 'Anysphere.Cursor' });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1603);
  });

  it('winget action missing id → none (no shell-out)', async () => {
    // { type: 'winget' } with no id should NOT call execFile
    // — execWinget short-circuits with { ok: false, reason: 'winget: missing id' }
    const result = await defaultExec({ type: 'winget' });
    expect(execFileSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/winget/);
  });
});
