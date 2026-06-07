/**
 * tests/integration/check-runner.test.js
 *
 * Phase 16: check-runner.runCheck() 单测.
 * 关键行为:
 *   - silent=false: 推 check-started / check-finished, 系统通知 (手动路径)
 *   - silent=true:  静默, 推 auto-check-finished (后台路径)
 *   - 都调 onCheckComplete(results) 给 tray + state-store
 *
 * 注: 系统通知 (Notification) 的 mock 行为不在这里测 — vitest 的 vi.mock 拦截
 * `const { Notification } = require('electron')` 不可靠 (mock factory 调用时机问题).
 * 系统通知在生产 Electron 渲染器手测覆盖.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { runCheck } from '../../src/main/check-runner.js';

function makePool(results = []) {
  return {
    enqueue: vi.fn(async () => results.shift() || { name: 'X', status: 'up_to_date' }),
  };
}

function makeCtx({ poolResults = [], onCheckComplete, sendToRenderer } = {}) {
  const calls = { started: [], finished: [], autoFinished: [], progress: [] };
  const send = (channel, payload) => {
    if (channel === 'check-started') calls.started.push(payload);
    else if (channel === 'check-finished') calls.finished.push(payload);
    else if (channel === 'auto-check-finished') calls.autoFinished.push(payload);
    else if (channel === 'check-progress') calls.progress.push(payload);
  };
  return {
    deps: {
      getConfig: () => ({ apps: [{ name: 'X', bundle: 'X.app', detectors: [] }] }),
      pool: makePool(poolResults),
      getWindow: () => ({ isDestroyed: () => false, webContents: { send: sendToRenderer || send } }),
      onCheckComplete: onCheckComplete || vi.fn(),
    },
    calls,
  };
}

describe('runCheck (Phase 16)', () => {
  describe('silent=false (手动, IPC)', () => {
    it('推 check-started 和 check-finished 事件', async () => {
      const { deps, calls } = makeCtx();
      await runCheck(deps, { silent: false });
      expect(calls.started).toHaveLength(1);
      expect(calls.finished).toHaveLength(1);
      expect(calls.autoFinished).toHaveLength(0);
    });

    it('都调 onCheckComplete (tray + state-store 用)', async () => {
      const onCheckComplete = vi.fn();
      const { deps } = makeCtx({ onCheckComplete });
      await runCheck(deps, { silent: false });
      expect(onCheckComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('silent=true (后台 auto-check)', () => {
    it('不推 check-started / check-finished', async () => {
      const { deps, calls } = makeCtx();
      await runCheck(deps, { silent: true });
      expect(calls.started).toHaveLength(0);
      expect(calls.finished).toHaveLength(0);
    });

    it('推 auto-check-finished 事件', async () => {
      const { deps, calls } = makeCtx();
      await runCheck(deps, { silent: true });
      expect(calls.autoFinished).toHaveLength(1);
      expect(calls.autoFinished[0].ts).toBeGreaterThan(0);
    });

    it('仍调 onCheckComplete (tray badge + state 还要更新)', async () => {
      const onCheckComplete = vi.fn();
      const { deps } = makeCtx({ onCheckComplete });
      await runCheck(deps, { silent: true });
      expect(onCheckComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('task 整个 reject 的容错', () => {
    it('pool.enqueue reject → 标 error result, 不 throw', async () => {
      const pool = {
        enqueue: vi.fn(async () => {
          throw new Error('worker died');
        }),
      };
      const { deps } = {
        deps: {
          getConfig: () => ({ apps: [{ name: 'X', bundle: 'X.app', detectors: [] }] }),
          pool,
          getWindow: () => ({ isDestroyed: () => false, webContents: { send: () => {} } }),
          onCheckComplete: vi.fn(),
        },
      };
      const results = await runCheck(deps, { silent: false });
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].note).toContain('worker died');
    });
  });

  describe('window 销毁时的容错', () => {
    it('getWindow 返回 null → 不 throw', async () => {
      const { deps } = {
        deps: {
          getConfig: () => ({ apps: [] }),
          pool: makePool(),
          getWindow: () => null,
          onCheckComplete: vi.fn(),
        },
      };
      const results = await runCheck(deps, { silent: false });
      expect(results).toEqual([]);
    });

    it('window isDestroyed → 不推事件', async () => {
      const { deps, calls } = {
        deps: {
          getConfig: () => ({ apps: [{ name: 'X', bundle: 'X.app', detectors: [] }] }),
          pool: makePool(),
          getWindow: () => ({ isDestroyed: () => true, webContents: { send: () => {} } }),
          onCheckComplete: vi.fn(),
        },
        calls: { started: [], finished: [], autoFinished: [], progress: [] },
      };
      await runCheck(deps, { silent: false });
      expect(calls.started).toHaveLength(0);
    });
  });
});
