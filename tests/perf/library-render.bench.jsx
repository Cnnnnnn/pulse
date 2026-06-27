// @vitest-environment happy-dom
/**
 * tests/perf/library-render.bench.jsx
 *
 * Task 26: LibraryPage 渲染性能基准.
 * ponytail: measurement only — 不 micro-optimize. 阈值是 generous 的 (50ms / 200ms),
 *          适配 CI 抖动. 如 flaky, 上调至 100ms / 300ms (plan Step 1 注).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.jsx";
import { results, resetCheck } from "../../src/renderer/store.js";
import {
  setViewMode,
  resetLibraryFilters,
} from "../../src/renderer/library-view-store.js";

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
  it("11 apps render < 50ms", () => {
    results.value = makeResults(11);
    const t0 = performance.now();
    render(<LibraryPage />);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(50);
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