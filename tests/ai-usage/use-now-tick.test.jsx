/**
 * tests/ai-usage/use-now-tick.test.jsx
 *
 * useNowTick hook 单元测试:
 * - 初始返回 now
 * - 每秒更新
 * - unmount 时 clearInterval (不泄漏)
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/preact";
import { useNowTick } from "../../src/renderer/hooks/useNowTick.jsx";

let _lastNow = null;
function Probe() {
  _lastNow = useNowTick(1000);
  return <div>{String(_lastNow)}</div>;
}

beforeEach(() => {
  vi.useFakeTimers();
  _lastNow = null;
  cleanup();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNowTick", () => {
  test("初始返回 Date.now()", () => {
    const now = Date.now();
    render(<Probe />);
    expect(_lastNow).toBe(now);
  });

  test("每秒更新一次", () => {
    const t0 = Date.now();
    render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(_lastNow).toBeGreaterThan(t0);
    // 2500ms 内应该更新 2 次 (1000ms, 2000ms)
    expect(_lastNow).toBeGreaterThanOrEqual(t0 + 2000);
  });

  test("unmount → clearInterval (不泄漏)", () => {
    const realClearInterval = globalThis.clearInterval;
    const clearSpy = vi.fn();
    globalThis.clearInterval = (id) => {
      clearSpy(id);
      return realClearInterval(id);
    };
    const { unmount } = render(<Probe />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    globalThis.clearInterval = realClearInterval;
  });

  test("intervalMs=0 → 不启动 interval, 不报错", () => {
    function ProbeOff() {
      _lastNow = useNowTick(0);
      return null;
    }
    const t0 = Date.now();
    render(<ProbeOff />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // 不应更新 — 仍是 t0
    expect(_lastNow).toBe(t0);
  });
});
