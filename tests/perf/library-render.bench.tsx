// @vitest-environment happy-dom
/**
 * tests/perf/library-render.bench.jsx
 *
 * Task 26: LibraryPage 渲染性能基准.
 * ponytail: measurement only — 不 micro-optimize. 阈值是 generous 的 (50ms / 200ms),
 *          适配 CI 抖动. 2026-07-24 v2.83+ AI 榜单入 nav (SideNav 多一节) 后 11 apps
 *          ~67ms, 阈值从 50 → 100ms; 100 apps 200ms 仍余量足. 如再 flaky, 上调 300ms (plan Step 1 注).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.tsx";
import { results, resetCheck } from "../../src/renderer/store.ts";
import {
  setViewMode,
  resetLibraryFilters,
} from "../../src/renderer/store/library-view-store.ts";

function makeResults(n) {
  const map = new Map();
  for (let i = 0; i < n; i++) {
    map.set(`app-${i}`, {
      name: `app-${i}`,
      has_update: i % 3 === 0,
      current_version: "1.0",
      latest_version: "1.1",
    });
  }
  return map;
}

beforeEach(() => {
  cleanup();
  resetLibraryFilters();
  resetCheck();
});

describe("perf: library render", () => {
  it("11 apps render < 100ms", () => {
    results.value = makeResults(11);
    const t0 = performance.now();
    render(<LibraryPage />);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(100);
  });
  it("100 apps card render < 200ms", () => {
    results.value = makeResults(100);
    setViewMode("card");
    const t0 = performance.now();
    render(<LibraryPage />);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(200);
  });
});