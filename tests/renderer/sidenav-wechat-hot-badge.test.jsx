// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";

const ithomeUnreadBadge = signal(0);
const wechatHotUnreadBadge = signal(0);

vi.mock("../../src/renderer/worldcup/navStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    NAV_KEYS_LIST: actual.NAV_KEYS_LIST,
    effectiveVisibleItems: actual.effectiveVisibleItems,
    activeNav: { value: "wechat-hot" },
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

vi.mock("../../src/renderer/ithome/store.js", () => ({ ithomeUnreadBadge }));
vi.mock("../../src/renderer/wechat-hot/store.js", () => ({ wechatHotUnreadBadge }));

beforeEach(() => {
  localStorage.clear();
  ithomeUnreadBadge.value = 0;
  wechatHotUnreadBadge.value = 0;
  document.body.innerHTML = "";
});

const { SideNav } = await import("../../src/renderer/components/SideNav.jsx");

function badgeText(navKey) {
  const li = document.body.querySelector(`.side-nav-item[data-nav="${navKey}"]`);
  if (!li) return null;
  const badge = li.querySelector(".side-nav-badge");
  return badge ? badge.textContent : null;
}

describe("SideNav — wechat-hot badge (I6 v2)", () => {
  it("wechatHotUnreadBadge=0 → 无 badge", () => {
    render(<SideNav />);
    expect(badgeText("wechat-hot")).toBeNull();
  });

  it("wechatHotUnreadBadge=7 → wechat-hot item badge 显示 7", () => {
    wechatHotUnreadBadge.value = 7;
    render(<SideNav />);
    expect(badgeText("wechat-hot")).toBe("7");
  });

  it("两个面板同时有未读 → 各自 badge 独立", () => {
    ithomeUnreadBadge.value = 3;
    wechatHotUnreadBadge.value = 5;
    render(<SideNav />);
    expect(badgeText("ithome")).toBe("3");
    expect(badgeText("wechat-hot")).toBe("5");
  });
});
