// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/preact";
import { signal } from "@preact/signals";

/**
 * P-N+ news 合并: news badge = ithomeUnreadBadge + wechatHotUnreadBadge.
 * 旧的 wechat-hot 独立 badge 已不存在, 改为验证合并行为.
 */

const ithomeUnreadBadge = signal(0);
const wechatHotUnreadBadge = signal(0);

vi.mock("../../src/renderer/worldcup/navStore.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    NAV_KEYS_LIST: actual.NAV_KEYS_LIST,
    effectiveVisibleItems: actual.effectiveVisibleItems,
    activeNav: { value: "news" },
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

describe("SideNav — news badge (P-N+ 合并 ithome + wechat-hot)", () => {
  it("两个 unread 都是 0 → news item 无 badge", () => {
    render(<SideNav />);
    expect(badgeText("news")).toBeNull();
  });

  it("ithomeUnreadBadge=3, wechatHotUnreadBadge=5 → news item badge 显示 8", () => {
    ithomeUnreadBadge.value = 3;
    wechatHotUnreadBadge.value = 5;
    render(<SideNav />);
    expect(badgeText("news")).toBe("8");
  });

  it("只有 wechatHotUnreadBadge=7 → news item badge 显示 7", () => {
    wechatHotUnreadBadge.value = 7;
    render(<SideNav />);
    expect(badgeText("news")).toBe("7");
  });

  it("只有 ithomeUnreadBadge=4 → news item badge 显示 4", () => {
    ithomeUnreadBadge.value = 4;
    render(<SideNav />);
    expect(badgeText("news")).toBe("4");
  });
});
