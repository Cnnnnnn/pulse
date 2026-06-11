/**
 * tests/main/library-brew-probe.test.js
 *
 * v2.7.2 (Library Auto-Detect): brew-probe.js.
 *
 * 覆盖 (~15 cases):
 *   - guessCaskName: appName / bundleName / 标点空格 / 大写 / 空
 *   - probeBrewCask: ok / cask_not_found / brew_not_installed / timeout / parse_failed
 */

import { describe, it, expect, vi } from 'vitest';
const { guessCaskName, probeBrewCask, classifyBrewError } = require('../../src/main/library/brew-probe.js');

describe('brew-probe: guessCaskName', () => {
  it('appName → lowercase', () => {
    expect(guessCaskName({ appName: 'Xsentinel', bundleName: 'Xsentinel.app' })).toBe('xsentinel');
    expect(guessCaskName({ appName: 'Cursor', bundleName: 'Cursor.app' })).toBe('cursor');
  });
  it('标点空格 → 替 -', () => {
    expect(guessCaskName({ appName: 'X-Sentinel Pro', bundleName: 'X-Sentinel Pro.app' })).toBe('x-sentinel-pro');
    expect(guessCaskName({ appName: 'My App!', bundleName: 'My App!.app' })).toBe('my-app');
  });
  it('bundleName fallback 当 appName 缺', () => {
    expect(guessCaskName({ appName: '', bundleName: 'Foo.app' })).toBe('foo');
    expect(guessCaskName({ bundleName: 'Bar.app' })).toBe('bar');
  });
  it('容错', () => {
    expect(guessCaskName(null)).toBeNull();
    expect(guessCaskName(undefined)).toBeNull();
    expect(guessCaskName({})).toBeNull();
    expect(guessCaskName({ appName: 42 })).toBeNull();
  });
  it('清理首尾 -', () => {
    expect(guessCaskName({ appName: '---foo---' })).toBe('foo');
  });
  it('超长 (64 char) 拒绝', () => {
    expect(guessCaskName({ appName: 'a'.repeat(65) })).toBeNull();
  });
});

describe('brew-probe: probeBrewCask', () => {
  /**
   * Build a fake execFile matching real child_process.execFile signature.
   * 真实 child process 是: exec(cmd, args, opts, cb) → 返 ChildProcess 对象, 带 .on(event).
   * 我们的代码用 child.on('error') 监 spawn fail. 所以 mock 必须返 { on: () => {} }.
   */
  function makeFakeExec(impl) {
    return (cmd, args, opts, cb) => {
      impl({ cmd, args, opts, cb });
      return { on: () => {} };  // 模拟 child_process 返的对象
    };
  }

  it('ok: brew info 返回 cask + version', async () => {
    const exec = makeFakeExec(({ cb }) => {
      setTimeout(() => cb(null, JSON.stringify({
        formulae: [],
        casks: [{ name: 'xsentinel', versions: { stable: '1.16.6' } }],
      }), ''), 10);
    });
    const r = await probeBrewCask('xsentinel', { execFileImpl: exec, timeout: 1000 });
    expect(r.ok).toBe(true);
    expect(r.version).toBe('1.16.6');
    expect(r.probeMs).toBeGreaterThanOrEqual(0);
  });

  it('cask 不存在 → ok:false reason:cask_not_found', async () => {
    const exec = makeFakeExec(({ cb }) => {
      setTimeout(() => cb(null, JSON.stringify({ formulae: [], casks: [] }), ''), 10);
    });
    const r = await probeBrewCask('doesnotexist123', { execFileImpl: exec, timeout: 1000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('cask_not_found');
  });

  it('brew 未装 (ENOENT) → reason:brew_not_installed', async () => {
    const err = new Error('spawn brew ENOENT');
    err.code = 'ENOENT';
    const exec = makeFakeExec(({ cb }) => {
      setTimeout(() => cb(err, '', ''), 10);
    });
    const r = await probeBrewCask('xsentinel', { execFileImpl: exec, timeout: 1000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('brew_not_installed');
  });

  it('timeout → reason:spawn_error_*', async () => {
    const err = new Error('Command failed: brew');
    err.code = 'ETIMEDOUT';
    const exec = makeFakeExec(({ cb }) => {
      setTimeout(() => cb(err, '', ''), 10);
    });
    const r = await probeBrewCask('xsentinel', { execFileImpl: exec, timeout: 1000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/spawn_error_ETIMEDOUT/);
  });

  it('parse 失败 → reason:parse_failed', async () => {
    const exec = makeFakeExec(({ cb }) => {
      setTimeout(() => cb(null, 'not json{{{', ''), 10);
    });
    const r = await probeBrewCask('xsentinel', { execFileImpl: exec, timeout: 1000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('parse_failed');
  });

  it('no version 字段 → reason:no_version', async () => {
    const exec = makeFakeExec(({ cb }) => {
      setTimeout(() => cb(null, JSON.stringify({ casks: [{ name: 'xsentinel', versions: {} }] }), ''), 10);
    });
    const r = await probeBrewCask('xsentinel', { execFileImpl: exec, timeout: 1000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_version');
  });

  it('空 cask → invalid_cask', async () => {
    const r = await probeBrewCask('');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_cask');
  });

  it('非 string cask → invalid_cask', async () => {
    const r = await probeBrewCask(null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_cask');
  });
});

describe('brew-probe: classifyBrewError', () => {
  it('ENOENT → brew_not_installed', () => {
    const err = new Error('x'); err.code = 'ENOENT';
    expect(classifyBrewError(err)).toBe('brew_not_installed');
  });
  it('其它 code → spawn_error_<code>', () => {
    const err = new Error('x'); err.code = 'EACCES';
    expect(classifyBrewError(err)).toBe('spawn_error_EACCES');
  });
  it('null → unknown', () => {
    expect(classifyBrewError(null)).toBe('unknown');
  });
});
