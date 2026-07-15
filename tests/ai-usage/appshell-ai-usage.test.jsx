/**
 * tests/ai-usage/appshell-ai-usage.test.jsx
 *
 * AppShell: activeNav='ai-usage' → 渲染 AIUsageLayout.
 */

// @vitest-environment happy-dom

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/preact";

let mockActiveNav = "versions";

vi.mock("../../src/renderer/worldcup/navStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  // 复用真实导出 (含 NAV_KEYS_LIST / PERSISTABLE_NAV_KEYS / effectiveVisibleItems),
  // 只覆盖测试需要控制的 activeNav / navCollapsed 两个 signal 与导航动作.
  return {
    ...actual,
    get activeNav() { return { get value() { return mockActiveNav; } }; },
    get navCollapsed() { return { value: false }; },
    setActiveNav: (k) => { mockActiveNav = k; },
    toggleNavCollapsed: () => {},
  };
});

vi.mock("../../src/renderer/reminders/remindersStore.js", () => ({
  get remindersOpen() { return { value: false }; },
  loadReminders: vi.fn(),
}));

vi.mock("../../src/renderer/components/SideNav.jsx", () => ({
  SideNav: () => <div data-testid="sidenav">sidenav</div>,
}));

vi.mock("../../src/renderer/components/VersionsLayout.jsx", () => ({
  VersionsLayout: () => <div data-testid="versions">versions</div>,
}));

vi.mock("../../src/renderer/worldcup/WorldcupLayout.jsx", () => ({
  WorldcupLayout: () => <div data-testid="worldcup">worldcup</div>,
}));

vi.mock("../../src/renderer/funds/FundLayout.jsx", () => ({
  FundLayout: () => <div data-testid="funds">funds</div>,
}));

vi.mock("../../src/renderer/ithome/NewsLayout.jsx", () => ({
  NewsLayout: () => <div data-testid="ithome">ithome</div>,
}));

vi.mock("../../src/renderer/components/AIUsageLayout.jsx", () => ({
  AIUsageLayout: () => <div data-testid="ai-usage">ai-usage</div>,
}));

const { AppShell } = await import("../../src/renderer/components/AppShell.jsx");

beforeEach(() => {
  mockActiveNav = "versions";
  cleanup();
});

describe("AppShell 路由", () => {
  test("activeNav='versions' → VersionsLayout", () => {
    mockActiveNav = "versions";
    const { getByTestId, queryByTestId } = render(<AppShell />);
    expect(getByTestId("versions")).toBeTruthy();
    expect(queryByTestId("ai-usage")).toBe(null);
  });

  test("activeNav='ai-usage' → AIUsageLayout", async () => {
    mockActiveNav = "ai-usage";
    const { getByTestId, queryByTestId } = render(<AppShell />);
    await waitFor(() => expect(getByTestId("ai-usage")).toBeTruthy());
    expect(queryByTestId("versions")).toBe(null);
  });
});
