// @vitest-environment happy-dom
/**
 * tests/renderer/sidenav-prefs.test.jsx
 *
 * Phase v1: SideNav 根据 tray menu prefs 过滤 4 个动态 nav tab.
 *
 * 覆盖:
 *  - 默认 prefs (全开): 8 个 nav 都显示 (Phase 32 stock-detail 合并到选股)
 *  - 关 updates (versions): versions 隐藏,其他还在
 *  - 4 个动态全关: 只剩 4 个固定 nav (ithome/wechat-hot/funds/stocks)
 *  - 关非动态 prefs (e.g. check_action 不影响 nav): 全部 nav 仍显示
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";

let mockActiveNavValue = "versions";
let mockNavCollapsedValue = false;
let mockTrayMenuPrefs = signal({
  version: 1,
  segments: {
    updates: true,
    ai_usage: true,
    worldcup: true,
    metals: true,
    check_action: true,
    config_action: true,
  },
});

vi.mock("../../src/renderer/worldcup/navStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    // 复用真实的 NAV_KEYS_LIST / effectiveVisibleItems (SideNav + sidenav-prefs 依赖),
    // 只覆盖 activeNav / navCollapsed 两个 signal 让测试可控.
    NAV_KEYS_LIST: actual.NAV_KEYS_LIST,
    effectiveVisibleItems: actual.effectiveVisibleItems,
    get activeNav() { return { get value() { return mockActiveNavValue; } }; },
    get navCollapsed() { return { get value() { return mockNavCollapsedValue; } }; },
    setActiveNav: vi.fn((k) => { mockActiveNavValue = k; }),
    toggleNavCollapsed: vi.fn(() => { mockNavCollapsedValue = !mockNavCollapsedValue; }),
  };
});

vi.mock("../../src/renderer/store.js", () => ({
  openAISettings: vi.fn(),
  needsConfig: () => false,
  get aiSessionsConfig() { return { value: null }; },
  get aiKeyStatus() { return { value: {} }; },
}));

vi.mock("../../src/renderer/nav-refresh.js", () => ({
  refreshActiveNav: vi.fn(),
  REFRESHABLE_NAV_KEYS: new Set(),
}));

vi.mock("../../src/renderer/trayConfigStore.js", () => ({
  get trayMenuPrefs() { return mockTrayMenuPrefs; },
}));

const { SideNav } = await import("../../src/renderer/components/SideNav.jsx");

beforeEach(() => {
  mockActiveNavValue = "versions";
  mockNavCollapsedValue = false;
  mockTrayMenuPrefs.value = {
    version: 1,
    segments: {
      updates: true,
      ai_usage: true,
      worldcup: true,
      metals: true,
      check_action: true,
      config_action: true,
    },
  };
  document.body.innerHTML = "";
});

function visibleNavKeys() {
  const items = Array.from(document.body.querySelectorAll(".side-nav-item"));
  return items.map((el) => el.getAttribute("data-nav"));
}

describe("SideNav — tray menu prefs 联动 (Phase v1)", () => {
  it("默认 prefs 全开 → 7 个 nav 全显示 (P-N news 合并 ithome + wechat-hot)", () => {
    render(<SideNav />);
    expect(visibleNavKeys()).toEqual([
      "news",
      "worldcup",
      "funds",
      "metals",
      "stocks",
      "ai-usage",
      "versions",
    ]);
  });

  it("关 updates (versions) → versions 隐藏", () => {
    mockTrayMenuPrefs.value = {
      ...mockTrayMenuPrefs.value,
      segments: { ...mockTrayMenuPrefs.value.segments, updates: false },
    };
    render(<SideNav />);
    const keys = visibleNavKeys();
    expect(keys).not.toContain("versions");
    expect(keys).toContain("news");
    expect(keys).toContain("worldcup");
    expect(keys).toContain("funds");
    expect(keys).toContain("metals");
    expect(keys).toContain("ai-usage");
  });

  it("关 ai_usage → ai-usage 隐藏", () => {
    mockTrayMenuPrefs.value = {
      ...mockTrayMenuPrefs.value,
      segments: { ...mockTrayMenuPrefs.value.segments, ai_usage: false },
    };
    render(<SideNav />);
    expect(visibleNavKeys()).not.toContain("ai-usage");
  });

  it("4 个动态全关 → 只剩 4 个固定 nav (news/funds/stocks)", () => {
    mockTrayMenuPrefs.value = {
      version: 1,
      segments: {
        updates: false,
        ai_usage: false,
        worldcup: false,
        metals: false,
        check_action: true,
        config_action: true,
      },
    };
    render(<SideNav />);
    expect(visibleNavKeys()).toEqual(["news", "funds", "stocks"]);
  });

  it("只关非动态 prefs (check_action/config_action) → 全部 nav 仍显示", () => {
    mockTrayMenuPrefs.value = {
      version: 1,
      segments: {
        updates: true,
        ai_usage: true,
        worldcup: true,
        metals: true,
        check_action: false,
        config_action: false,
      },
    };
    render(<SideNav />);
    expect(visibleNavKeys()).toEqual([
      "news",
      "worldcup",
      "funds",
      "metals",
      "stocks",
      "ai-usage",
      "versions",
    ]);
  });
});
