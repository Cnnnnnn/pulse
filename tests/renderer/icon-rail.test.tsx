// @vitest-environment happy-dom
/**
 * tests/renderer/icon-rail.test.tsx
 *
 * Phase 9 收尾补测 — IconRail 是新外壳的常驻 48px 图标边栏 (替代老 188px SideNav).
 *
 * 行为契约:
 *   - 渲染 5 个按钮: 1 Home + 3 section (news/holdings/system) + 1 Settings
 *   - Home click → setActiveNav('home')
 *   - Settings click → setActiveNav('versions') + navigateTo('settings')
 *   - section hover → onHoverSection(sectionId)
 *   - section leave → onLeaveSection()
 *   - collapsed → .icon-rail-collapsed class
 *   - 去 Phase 9 兼容 class: 不再带 .side-nav
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

// 用 let + getter 让 mock 跟测试同步改值.
let mockActiveNav = "home";
let mockNavCollapsed = false;
const mockSetActiveNav = vi.fn();
const mockNavigateTo = vi.fn();

vi.mock("../../src/renderer/nav/navStore.ts", () => ({
  get activeNav() {
    return { get value() { return mockActiveNav; } };
  },
  get navCollapsed() {
    return { get value() { return mockNavCollapsed; } };
  },
  setActiveNav: (k: string) => mockSetActiveNav(k),
}));

vi.mock("../../src/renderer/store/route-store.ts", () => ({
  navigateTo: (r: string) => mockNavigateTo(r),
}));

import { IconRail } from "../../src/renderer/components/IconRail.tsx";

describe("IconRail — 渲染", () => {
  beforeEach(() => {
    mockActiveNav = "home";
    mockNavCollapsed = false;
    mockSetActiveNav.mockClear();
    mockNavigateTo.mockClear();
    cleanup();
  });

  it("6 个 .icon-rail-btn (1 Home + 4 section + 1 Settings)", () => {
    const { container } = render(<IconRail />);
    const buttons = container.querySelectorAll("button.icon-rail-btn");
    expect(buttons.length).toBe(6);
  });

  it("4 个 section 按钮各带 data-section attr (news/holdings/system/entertainment)", () => {
    const { container } = render(<IconRail />);
    expect(container.querySelector('[data-section="news"]')).toBeTruthy();
    expect(container.querySelector('[data-section="holdings"]')).toBeTruthy();
    expect(container.querySelector('[data-section="system"]')).toBeTruthy();
    expect(container.querySelector('[data-section="entertainment"]')).toBeTruthy();
  });

  it("Settings 按钮用 data-testid='icon-rail-settings-btn' (Phase 9 收尾改名)", () => {
    const { container } = render(<IconRail />);
    expect(
      container.querySelector('[data-testid="icon-rail-settings-btn"]')
    ).toBeTruthy();
    // 老 testid 已彻底替换
    expect(
      container.querySelector('[data-testid="side-nav-settings-btn"]')
    ).toBeNull();
  });

  it("activeNav='home' → Home 按钮带 is-active class", () => {
    mockActiveNav = "home";
    const { container } = render(<IconRail />);
    const homeBtn = container.querySelector('button[aria-label="首页"]');
    expect(homeBtn?.classList.contains("is-active")).toBe(true);
  });

  it("activeNav='news' → news section 按钮带 is-active class (active section 高亮)", () => {
    mockActiveNav = "news";
    const { container } = render(<IconRail />);
    const newsBtn = container.querySelector('[data-section="news"]');
    expect(newsBtn?.classList.contains("is-active")).toBe(true);
    const homeBtn = container.querySelector('button[aria-label="首页"]');
    expect(homeBtn?.classList.contains("is-active")).toBe(false);
  });
});

describe("IconRail — 交互", () => {
  beforeEach(() => {
    mockActiveNav = "news";
    mockSetActiveNav.mockClear();
    mockNavigateTo.mockClear();
    cleanup();
  });

  it("点击 Home → setActiveNav('home')", () => {
    const { container } = render(<IconRail />);
    const homeBtn = container.querySelector('button[aria-label="首页"]') as HTMLElement;
    fireEvent.click(homeBtn);
    expect(mockSetActiveNav).toHaveBeenCalledWith("home");
  });

  it("点击 Settings → setActiveNav('versions') + navigateTo('settings')", () => {
    const { container } = render(<IconRail />);
    const settingsBtn = container.querySelector(
      '[data-testid="icon-rail-settings-btn"]'
    ) as HTMLElement;
    fireEvent.click(settingsBtn);
    expect(mockSetActiveNav).toHaveBeenCalledWith("versions");
    expect(mockNavigateTo).toHaveBeenCalledWith("settings");
  });

  it("section hover → onHoverSection(sectionId)", () => {
    const onHover = vi.fn();
    const { container } = render(<IconRail onHoverSection={onHover} />);
    const newsBtn = container.querySelector('[data-section="news"]') as HTMLElement;
    fireEvent.mouseEnter(newsBtn);
    expect(onHover).toHaveBeenCalledWith("news");
  });

  it("section leave → onLeaveSection()", () => {
    const onLeave = vi.fn();
    const { container } = render(<IconRail onLeaveSection={onLeave} />);
    const newsBtn = container.querySelector('[data-section="news"]') as HTMLElement;
    fireEvent.mouseLeave(newsBtn);
    expect(onLeave).toHaveBeenCalled();
  });

  it("section focus → onHoverSection (键盘 a11y)", () => {
    const onHover = vi.fn();
    const { container } = render(<IconRail onHoverSection={onHover} />);
    const newsBtn = container.querySelector('[data-section="news"]') as HTMLElement;
    fireEvent.focus(newsBtn);
    expect(onHover).toHaveBeenCalledWith("news");
  });
});

describe("IconRail — collapsed 态 + Phase 9 收尾 class 清理", () => {
  beforeEach(() => cleanup());

  it("navCollapsed=true → 加 .icon-rail-collapsed class", () => {
    mockNavCollapsed = true;
    const { container } = render(<IconRail />);
    const rail = container.querySelector(".icon-rail");
    expect(rail?.classList.contains("icon-rail-collapsed")).toBe(true);
  });

  it("Phase 9 收尾: 不再带 .side-nav 兼容 class", () => {
    const { container } = render(<IconRail />);
    const rail = container.querySelector(".icon-rail");
    expect(rail?.classList.contains("side-nav")).toBe(false);
    expect(rail?.classList.contains("side-nav-collapsed")).toBe(false);
  });
});
