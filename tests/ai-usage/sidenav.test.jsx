/**
 * tests/ai-usage/sidenav.test.jsx
 *
 * TDD: SideNav 应当包含 "AI 用量" 入口项, data-nav="ai-usage".
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

let mockActiveNav = "versions";
let mockNavCollapsed = false;

vi.mock("../../src/renderer/worldcup/navStore.js", () => ({
  get activeNav() { return { get value() { return mockActiveNav; } }; },
  get navCollapsed() { return { get value() { return mockNavCollapsed; } }; },
  setActiveNav: (k) => { mockActiveNav = k; },
  toggleNavCollapsed: () => { mockNavCollapsed = !mockNavCollapsed; },
}));

vi.mock("../../src/renderer/store.js", () => ({
  openAISettings: vi.fn(),
  needsConfig: () => false,
  get aiSessionsConfig() { return { value: null }; },
  get aiKeyStatus() { return { value: {} }; },
}));

const { SideNav } = await import("../../src/renderer/components/SideNav.jsx");

beforeEach(() => {
  mockActiveNav = "versions";
  mockNavCollapsed = false;
  cleanup();
});

describe("SideNav Minimax 入口", () => {
  test("包含 ai-usage 入口项 (label 标注 Minimax)", () => {
    const { container } = render(<SideNav />);
    const item = container.querySelector('[data-nav="ai-usage"]');
    expect(item).toBeTruthy();
    expect(item.textContent).toContain("Minimax");
  });

  test("点击 → setActiveNav('ai-usage')", () => {
    const { container } = render(<SideNav />);
    const btn = container.querySelector('[data-nav="ai-usage"] button');
    fireEvent.click(btn);
    expect(mockActiveNav).toBe("ai-usage");
  });

  test("activeNav='ai-usage' → 该 item 高亮", () => {
    mockActiveNav = "ai-usage";
    const { container } = render(<SideNav />);
    const item = container.querySelector('[data-nav="ai-usage"]');
    expect(item.className).toContain("side-nav-item-active");
  });
});
