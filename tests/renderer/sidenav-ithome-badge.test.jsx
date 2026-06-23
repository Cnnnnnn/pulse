// @vitest-environment happy-dom
/**
 * tests/renderer/sidenav-ithome-badge.test.jsx
 *
 * I6: SideNav 把 ithomeUnreadBadge 注入 ithome item.
 * - ithome item 带 badge 数字; 其他 nav item 不带.
 *
 * mock 策略跟 sidenav-prefs.test.jsx 一致 (navStore/store/trayConfigStore),
 * 额外 mock ithome/store.js 的 ithomeUnreadBadge 让 badge 可控.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";

const ithomeUnreadBadge = signal(0);

vi.mock("../../src/renderer/worldcup/navStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    NAV_KEYS_LIST: actual.NAV_KEYS_LIST,
    effectiveVisibleItems: actual.effectiveVisibleItems,
    activeNav: { value: "ithome" },
    navCollapsed: { value: false },
    setActiveNav: vi.fn(),
    toggleNavCollapsed: vi.fn(),
  };
});

vi.mock("../../src/renderer/store.js", () => ({
  openAISettings: vi.fn(),
  needsConfig: () => false,
  aiSessionsConfig: { value: null },
  aiKeyStatus: { value: {} },
}));

vi.mock("../../src/renderer/nav-refresh.js", () => ({
  refreshActiveNav: vi.fn(),
  REFRESHABLE_NAV_KEYS: new Set(),
}));

vi.mock("../../src/renderer/trayConfigStore.js", () => ({
  trayMenuPrefs: signal({
    version: 1,
    segments: {
      updates: true, ai_usage: true, worldcup: true, metals: true,
      check_action: true, config_action: true,
    },
  }),
}));

vi.mock("../../src/renderer/ithome/store.js", () => ({
  ithomeUnreadBadge,
}));

// localStorage 初始化 (sidenav-prefs loadPrefs 依赖)
beforeEach(() => {
  localStorage.clear();
  ithomeUnreadBadge.value = 0;
  document.body.innerHTML = "";
});

const { SideNav } = await import("../../src/renderer/components/SideNav.jsx");

function ithomeBadgeText() {
  const li = document.body.querySelector('.side-nav-item[data-nav="ithome"]');
  if (!li) return null;
  const badge = li.querySelector(".side-nav-badge");
  return badge ? badge.textContent : null;
}

describe("SideNav — ithome badge 联动 (I6)", () => {
  it("ithomeUnreadBadge=0 → ithome item 无 badge", () => {
    render(<SideNav />);
    expect(ithomeBadgeText()).toBeNull();
  });

  it("ithomeUnreadBadge=5 → ithome item badge 显示 5", () => {
    ithomeUnreadBadge.value = 5;
    render(<SideNav />);
    expect(ithomeBadgeText()).toBe("5");
  });

  it("非 ithome item 永远无 badge", () => {
    ithomeUnreadBadge.value = 9;
    render(<SideNav />);
    const others = ["wechat-hot", "worldcup", "funds", "versions"];
    for (const key of others) {
      const li = document.body.querySelector(`.side-nav-item[data-nav="${key}"]`);
      if (li) {
        expect(li.querySelector(".side-nav-badge")).toBeNull();
      }
    }
  });
});
