/**
 * src/renderer/auto-recheck.js
 *
 * Phase 24: Bulk Upgrade done → 2s 后自动重检.
 * 修 "升级完还显示有更新" UX bug (state 没刷新).
 *
 * 设计:
 *   - factory 函数, 注入 triggerCheck
 *   - 内部维护 pending timer
 *   - schedule() 同时只会有一个 timer (newer replaces older)
 *   - cancel() 由 triggerCheck 在用户手点时调用, 防双跑
 *
 * 测试: vi.useFakeTimers() + 调 schedule() + vi.advanceTimersByTime(2000)
 */

const AUTO_RECHECK_DELAY_MS = 2000;

export function createAutoRecheck({ triggerCheck }) {
  if (typeof triggerCheck !== 'function') {
    throw new Error('createAutoRecheck: triggerCheck must be a function');
  }

  let pending = null;

  function schedule() {
    if (pending != null) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      triggerCheck();
    }, AUTO_RECHECK_DELAY_MS);
  }

  function cancel() {
    if (pending != null) {
      clearTimeout(pending);
      pending = null;
    }
  }

  function isPending() {
    return pending != null;
  }

  return { schedule, cancel, isPending, _DELAY_MS: AUTO_RECHECK_DELAY_MS };
}
