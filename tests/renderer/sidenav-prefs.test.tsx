// @vitest-environment happy-dom
/**
 * tests/renderer/sidenav-prefs.test.jsx
 *
 * Phase v1: SideNav 根据 tray menu prefs 过滤动态 nav tab.
 * Phase 32 (2026-07-13): funds/metals/stocks 合并为 'invest', 总 nav 从 7 减到 5.
 *
 * 覆盖:
 *  - 默认 prefs (全开): 6 个 nav 都显示
 *  - 关 updates (versions): versions 隐藏,其他还在
 *  - 3 个动态全关: 只剩 3 个固定 nav (news/invest/github)
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

vi.mock("../../src/renderer/worldcup/navStore.ts", async (importOriginal) => {
  const actual = await importOriginal();
  // ponytail: 把 NAV_KEYS_LIST 暴露给测试, 让期望与真相常量化.
  // 加 nav 时只改 navStore.ts 一处, 这三处期望不脱节.
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

vi.mock("../../src/renderer/store.ts", () => ({
  openAISettings: vi.fn(),
  needsConfig: () => false,
  get aiSessionsConfig() { return { value: null }; },
  get aiKeyStatus() { return { value: {} }; },
}));

vi.mock("../../src/renderer/nav-refresh.ts", () => ({
  refreshActiveNav: vi.fn(),
  REFRESHABLE_NAV_KEYS: new Set(),
}));

vi.mock("../../src/renderer/store/trayConfigStore.ts", () => ({
  get trayMenuPrefs() { return mockTrayMenuPrefs; },
}));

const { SideNav } = await import("../../src/renderer/components/SideNav.tsx");
const { NAV_KEYS_LIST } = await import("../../src/renderer/worldcup/navStore.ts");

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
  it("默认 prefs 全开 → NAV_KEYS_LIST 全显示", () => {
    render(<SideNav />);
    // ponytail: 期望来自常量, 加 nav 时 navStore.ts 一处改.
    expect(visibleNavKeys()).toEqual(NAV_KEYS_LIST);
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
    expect(keys).toContain("invest");
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

  it("3 个动态全关 → 只剩固定 nav", () => {
    mockTrayMenuPrefs.value = {
      version: 1,
      segments: {
        updates: false,
        ai_usage: false,
        worldcup: false,
        metals: false,
        check_action: true,
        config_action: true,
        leaderboard: true, // v2.83: AI 榜单独立 segment
      },
    };
    render(<SideNav />);
    // ponytail: 固定 nav = NAV_KEYS_LIST - {versions, ai-usage, worldcup}
    const dynamicKey = new Set(["versions", "ai-usage", "worldcup"]);
    expect(visibleNavKeys()).toEqual(
      NAV_KEYS_LIST.filter((k) => !dynamicKey.has(k)),
    );
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
        leaderboard: true, // v2.83: AI 榜单
      },
    };
    render(<SideNav />);
    expect(visibleNavKeys()).toEqual(NAV_KEYS_LIST);
  });
});
