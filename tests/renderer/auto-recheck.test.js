/**
 * tests/renderer/auto-recheck.test.js
 *
 * Phase 24: createAutoRecheck 行为.
 * 4 case: schedule → 2s 后触发 / 用户 cancel 阻止 / 多次 schedule 替换 / 状态正确.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutoRecheck } from '../../src/renderer/auto-recheck.js';

describe('createAutoRecheck (Phase 24)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedule() 2s 后调 triggerCheck', () => {
    const triggerCheck = vi.fn();
    const ar = createAutoRecheck({ triggerCheck });
    ar.schedule();
    expect(triggerCheck).not.toHaveBeenCalled();
    expect(ar.isPending()).toBe(true);

    vi.advanceTimersByTime(1999);
    expect(triggerCheck).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(triggerCheck).toHaveBeenCalledTimes(1);
    expect(ar.isPending()).toBe(false);
  });

  it('cancel() 阻止 triggerCheck', () => {
    const triggerCheck = vi.fn();
    const ar = createAutoRecheck({ triggerCheck });
    ar.schedule();
    ar.cancel();
    expect(ar.isPending()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(triggerCheck).not.toHaveBeenCalled();
  });

  it('多次 schedule() 只保留最新 (前一个被 cancel 替换)', () => {
    const triggerCheck = vi.fn();
    const ar = createAutoRecheck({ triggerCheck });
    ar.schedule();
    vi.advanceTimersByTime(1000);
    ar.schedule(); // 重置 timer
    vi.advanceTimersByTime(1500); // 第一个 schedule 的 2s 早就过, 但第二个还有 0.5s
    expect(triggerCheck).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500); // 第二个 schedule 的 2s 到
    expect(triggerCheck).toHaveBeenCalledTimes(1);
  });

  it('triggerCheck 抛错不影响下次 schedule', () => {
    let firstCall = true;
    const triggerCheck = vi.fn(() => {
      if (firstCall) {
        firstCall = false;
        throw new Error('boom');
      }
    });
    const ar = createAutoRecheck({ triggerCheck });
    ar.schedule();
    // 用 try/catch 包, setTimeout 不会捕获同步抛错 — 模拟 "triggerCheck 失败不爆"
    try { vi.advanceTimersByTime(2000); } catch { /* noop */ }
    // 重新 schedule
    expect(() => ar.schedule()).not.toThrow();
    vi.advanceTimersByTime(2000);
    expect(triggerCheck).toHaveBeenCalledTimes(2);
  });

  it('triggerCheck 必须是函数, 传非函数抛错', () => {
    expect(() => createAutoRecheck({})).toThrow();
    expect(() => createAutoRecheck({ triggerCheck: 'not a function' })).toThrow();
  });

  it('_DELAY_MS 暴露给外部 (用于测试 / 文档)', () => {
    const ar = createAutoRecheck({ triggerCheck: vi.fn() });
    expect(ar._DELAY_MS).toBe(2000);
  });
});
