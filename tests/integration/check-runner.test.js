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

  // Phase 17 latent bug fix: 之前传 appsMap 给 suppressedByCooldown, 内部读
  // (appsMap).apps = undefined → cooldown 永远不触发. 默认 cooldown=0 掩盖了.
  // 现在传整个 state, 让函数读 state.apps.
  describe('cooldown 抑制 (Phase 17 bug fix regression)', () => {
    function makeResult(name, hasUpdate = true) {
      return {
        name,
        installed_version: '1.0',
        latest_version: hasUpdate ? '1.1' : '1.0',
        has_update: hasUpdate,
        status: hasUpdate ? 'update_available' : 'up_to_date',
        source: 'brew_formulae',
        note: '',
        bundle: `${name}.app`,
      };
    }

    function makeDeps({ results, state, notifCfg = {} } = {}) {
      const markNotified = vi.fn();
      return {
        getConfig: () => ({
          apps: results.map((r) => ({ name: r.name, bundle: r.bundle, detectors: [] })),
          notifications: notifCfg,
        }),
        pool: {
          enqueue: vi.fn(async (task) => {
            if (task.type === 'detect-app') {
              return results.find((r) => r.name === task.payload.appCfg.name);
            }
            return { success: true, output: '' };
          }),
        },
        getWindow: () => null,
        onCheckComplete: vi.fn(),
        getState: () => state,
        markNotified,
        Notification: class FakeNotification { show() { /* noop */ } },
      };
    }

    it('cooldown 内的 app 被抑制 (last_notified 在窗口内)', async () => {
      const now = Date.now();
      const results = [makeResult('Cursor'), makeResult('Kimi')];
      const state = {
        apps: {
          // Cursor: 1 小时前通知过, 24h cooldown 内 → 应被抑制
          Cursor: { name: 'Cursor', last_notified: now - 1 * 60 * 60 * 1000 },
        },
      };
      const deps = makeDeps({ results, state, notifCfg: { cooldown_hours: 24 } });
      const markNotified = deps.markNotified;

      await runCheck(deps, { silent: false });

      // Cursor 被 cooldown 抑制, Kimi 正常
      expect(markNotified).toHaveBeenCalledTimes(1);
      expect(markNotified).toHaveBeenCalledWith(['Kimi']);
    });

    it('cooldown 已过的 app 正常通知 (last_notified 超出窗口)', async () => {
      const now = Date.now();
      const results = [makeResult('Cursor')];
      const state = {
        apps: { Cursor: { name: 'Cursor', last_notified: now - 25 * 60 * 60 * 1000 } },
      };
      const deps = makeDeps({ results, state, notifCfg: { cooldown_hours: 24 } });
      const markNotified = deps.markNotified;

      await runCheck(deps, { silent: false });

      expect(markNotified).toHaveBeenCalledWith(['Cursor']);
    });

    it('state 没 apps 字段 → 不抑制 (兼容老 state.json)', async () => {
      const results = [makeResult('Cursor')];
      const deps = makeDeps({ results, state: {}, notifCfg: { cooldown_hours: 24 } });
      const markNotified = deps.markNotified;

      await runCheck(deps, { silent: false });

      expect(markNotified).toHaveBeenCalledWith(['Cursor']);
    });
  });
});
