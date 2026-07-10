/**
 * tests/ai-usage/useBrushRange.test.js
 *
 * useBrushRange hook: 区间刷选状态机 + 像素↔索引换算.
 */

// @vitest-environment happy-dom

import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/preact";
const { useBrushRange } = await import("../../src/renderer/hooks/useBrushRange.js");

describe("useBrushRange", () => {
  test("初始 null range + visible = [0, length-1]", () => {
    const { result } = renderHook(() => useBrushRange(90));
    expect(result.current.range).toBeNull();
    expect(result.current.visible).toEqual([0, 89]);
  });

  test("setBrush 设置合法区间 → visible 同步", () => {
    const { result } = renderHook(() => useBrushRange(90));
    act(() => result.current.setBrush(10, 30));
    expect(result.current.range).toEqual([10, 30]);
    expect(result.current.visible).toEqual([10, 30]);
  });

  test("setBrush 区间过窄 (<2 点) → 自动 null", () => {
    const { result } = renderHook(() => useBrushRange(90));
    act(() => result.current.setBrush(10, 10));
    expect(result.current.range).toBeNull();
  });

  test("setBrush 接受 start > end → 内部排序", () => {
    const { result } = renderHook(() => useBrushRange(90));
    act(() => result.current.setBrush(30, 10));
    expect(result.current.range).toEqual([10, 30]);
  });

  test("setBrush 自动 clamp 到 [0, length-1]", () => {
    const { result } = renderHook(() => useBrushRange(90));
    act(() => result.current.setBrush(-5, 200));
    expect(result.current.range).toEqual([0, 89]);
  });

  test("reset() → null + visible 全量", () => {
    const { result } = renderHook(() => useBrushRange(90));
    act(() => result.current.setBrush(10, 30));
    act(() => result.current.reset());
    expect(result.current.range).toBeNull();
    expect(result.current.visible).toEqual([0, 89]);
  });

  test("xForIndex / indexFromX 像素↔索引对偶", () => {
    const { result } = renderHook(() => useBrushRange(90));
    const plotLeft = 44;
    const plotWidth = 956;
    // 索引 0 → plotLeft
    expect(result.current.xForIndex(0, plotLeft, plotWidth)).toBeCloseTo(plotLeft, 5);
    // 索引 89 → plotLeft + plotWidth
    expect(result.current.xForIndex(89, plotLeft, plotWidth)).toBeCloseTo(plotLeft + plotWidth, 5);
    // 对偶换算 (for any i, xForIndex → indexFromX 回到 i)
    for (const i of [0, 10, 45, 89]) {
      const x = result.current.xForIndex(i, plotLeft, plotWidth);
      expect(result.current.indexFromX(x, plotLeft, plotWidth)).toBe(i);
    }
  });

  test("length <= 1 → setBrush 强制 null", () => {
    const { result } = renderHook(() => useBrushRange(1));
    act(() => result.current.setBrush(0, 0));
    expect(result.current.range).toBeNull();
  });
});