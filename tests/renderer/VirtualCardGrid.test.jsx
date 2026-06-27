// @vitest-environment happy-dom
/**
 * tests/renderer/VirtualCardGrid.test.jsx
 *
 * Task 13: VirtualCardGrid 窗口化渲染 — 200 apps 时只渲染可视区子集.
 */
import { describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { VirtualCardGrid } from "../../src/renderer/components/VirtualCardGrid.jsx";

vi.mock("../../src/renderer/store.js", async () => {
  const { signal } = await import("@preact/signals");
  const names = Array.from({ length: 200 }, (_, i) => `app-${i}`);
  const map = new Map(names.map((n) => [n, { name: n, has_update: false, current_version: "1", latest_version: "1" }]));
  return {
    results: signal(map),
    getResultSignal: (name) => signal(map.get(name)),
    getAppPhaseSignal: () => signal(null),
  };
});

describe("VirtualCardGrid", () => {
  it("默认只渲染可视区 (~30 个, 不是 200)", () => {
    const { unmount } = render(<VirtualCardGrid />);
    const cards = document.querySelectorAll(".app-card");
    expect(cards.length).toBeLessThan(60);
    expect(cards.length).toBeGreaterThan(0);
    unmount();
  });
});