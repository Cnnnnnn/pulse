/**
 * tests/ai-usage/useUsageSeries.test.js
 *
 * useUsageSeries hook 把扁平 daily token 数适配成 SeriesPoint[].
 * 纯函数行为 (无 DOM, 无 store), happy-dom + preact/hooks 测试.
 */

// @vitest-environment happy-dom

import { describe, test, expect } from "vitest";
import { renderHook } from "@testing-library/preact";
const { useUsageSeries } = await import("../../src/renderer/hooks/useUsageSeries.js");

describe("useUsageSeries", () => {
  test("null/undefined 输入 → empty 状态 + 0 points", () => {
    const { result } = renderHook(() => useUsageSeries(null));
    expect(result.current.points).toEqual([]);
    expect(result.current.status).toBe("empty");
    expect(result.current.count).toBe(0);
  });

  test("空数组 → empty", () => {
    const { result } = renderHook(() => useUsageSeries([]));
    expect(result.current.points).toEqual([]);
    expect(result.current.status).toBe("empty");
  });

  test("loading 显式传 true → loading 状态覆盖 empty", () => {
    const { result } = renderHook(() => useUsageSeries([], { loading: true }));
    expect(result.current.status).toBe("loading");
    expect(result.current.loading).toBe(true);
  });

  test("error 显式传 true → error 状态", () => {
    const { result } = renderHook(() => useUsageSeries([1, 2, 3], { error: true }));
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(true);
    expect(result.current.count).toBe(3);
  });

  test("有效数组 → ready + count = n", () => {
    const daily = Array.from({ length: 90 }, (_, i) => 1_000 + i);
    const { result } = renderHook(() => useUsageSeries(daily));
    expect(result.current.status).toBe("ready");
    expect(result.current.count).toBe(90);
    expect(result.current.points).toHaveLength(90);
  });

  test("last 7 天前的同日值作为 lastWeek", () => {
    const daily = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const { result } = renderHook(() => useUsageSeries(daily));
    const pts = result.current.points;
    expect(pts[0].lastWeek).toBeNull();
    expect(pts[7].lastWeek).toBe(10);
    expect(pts[8].lastWeek).toBe(20);
    expect(pts[9].lastWeek).toBe(30);
  });

  test("每点 ISO date 旧→新 (最新 = 今天)", () => {
    const daily = [1, 2, 3];
    const { result } = renderHook(() => useUsageSeries(daily));
    const pts = result.current.points;
    expect(pts[0].date < pts[1].date).toBe(true);
    expect(pts[1].date < pts[2].date).toBe(true);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(pts[2].date).toBe(todayStr);
  });

  test("无效 token 数 (NaN / undefined) → 0", () => {
    const daily = [10, undefined, NaN, 40, 50];
    const { result } = renderHook(() => useUsageSeries(daily));
    expect(result.current.points[0].total).toBe(10);
    expect(result.current.points[1].total).toBe(0);
    expect(result.current.points[2].total).toBe(0);
    expect(result.current.points[3].total).toBe(40);
  });
});