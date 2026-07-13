// @vitest-environment happy-dom
/**
 * I6 v3: SideNav 基金 / AI 用量角标联动.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";

const fundUnreadBadge = signal(0);
const aiUsageNavBadge = signal(0);

vi.mock("../../src/renderer/worldcup/navStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    NAV_KEYS_LIST: actual.NAV_KEYS_LIST,
    effectiveVisibleItems: actual.effectiveVisibleItems,
    activeNav: { value: "versions" },
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
      updates: true,
      ai_usage: true,
      worldcup: true,
      metals: true,
      check_action: true,
      config_action: true,
    },
  }),
}));

vi.mock("../../src/renderer/ithome/store.js", () => ({
  ithomeUnreadBadge: signal(0),
}));

vi.mock("../../src/renderer/wechat-hot/store.js", () => ({
  wechatHotUnreadBadge: signal(0),
}));

vi.mock("../../src/renderer/funds/fundStore.js", () => ({
  fundUnreadBadge,
}));

vi.mock("../../src/renderer/store/ai-usage-store.js", () => ({
  aiUsageNavBadge,
}));

beforeEach(() => {
  localStorage.clear();
  fundUnreadBadge.value = 0;
  aiUsageNavBadge.value = 0;
  document.body.innerHTML = "";
});

const { SideNav } = await import("../../src/renderer/components/SideNav.jsx");

function badgeText(navKey) {
  const li = document.body.querySelector(`.side-nav-item[data-nav="${navKey}"]`);
  if (!li) return null;
  const badge = li.querySelector(".side-nav-badge");
  return badge ? badge.textContent : null;
}

describe("SideNav — invest / ai-usage badge (I6 v3 + 投资 nav 合并)", () => {
  it("fundUnreadBadge=3 → invest item 显示 3 (原 funds 角标迁到投资)", () => {
    fundUnreadBadge.value = 3;
    render(<SideNav />);
    expect(badgeText("invest")).toBe("3");
  });

  it("aiUsageNavBadge=2 → ai-usage item 显示 2", () => {
    aiUsageNavBadge.value = 2;
    render(<SideNav />);
    expect(badgeText("ai-usage")).toBe("2");
  });

  it("角标为 0 时不显示", () => {
    render(<SideNav />);
    expect(badgeText("invest")).toBeNull();
    expect(badgeText("ai-usage")).toBeNull();
  });
});
