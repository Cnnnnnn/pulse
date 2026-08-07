// @vitest-environment happy-dom
/**
 * tests/renderer/nav-drawer.test.tsx
 *
 * Phase 9 收尾补测 — NavDrawer 是 IconRail hover 弹出的轻量导航抽屉 (替代老 SideNav 主体).
 *
 * 行为契约:
 *   - section=null → 不渲染 (AppShell hover 状态机管理)
 *   - section=X → 渲染 .nav-drawer + data-section="X" + 该 section 下的 nav items
 *   - 按 NAV_REGISTRY.section 分组 (news section: news/ai-leaderboard/games/github; holdings: invest/ai-usage; system: versions)
 *   - active 项加 .nav-drawer-item-active class
 *   - 可见项 = effectiveVisibleItems (sidenav-prefs) ∩ trayMenuPrefs.segments
 *   - 鼠标移入/移出 onEnter/onLeave (AppShell 用来维持 hover 状态)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

let mockActiveNav = "news";
const mockSetActiveNav = vi.fn();
const mockGoInvest = vi.fn();
let mockTrayPrefs: any = {
  version: 1,
  segments: { updates: true, ai_usage: true } as Record<string, boolean>,
};

vi.mock("../../src/renderer/nav/navStore.ts", () => ({
  get activeNav() {
    return { get value() { return mockActiveNav; } };
  },
  setActiveNav: (k: string) => mockSetActiveNav(k),
  goInvest: (k?: string) => mockGoInvest(k),
  // 简化: 不消费 prefs, 全部可见 (按 NAV_KEYS_LIST 顺序)
  effectiveVisibleItems: () => [
    "news",
    "ai-leaderboard",
    "games",
    "github",
    "invest",
    "ai-usage",
    "versions",
  ],
}));

vi.mock("../../src/renderer/store/trayConfigStore.ts", () => ({
  get trayMenuPrefs() {
    return { get value() { return mockTrayPrefs; } };
  },
}));

vi.mock("../../src/renderer/components/sidenav-prefs.ts", () => ({
  loadPrefs: () => ({ version: 2, order: [], hidden: [], favorites: [] }),
  savePrefs: vi.fn(),
  listHidden: () => [],
  hideItem: (p: any) => p,
  restoreItem: (p: any) => p,
  reorderItems: (p: any) => p,
  moveToTop: (p: any) => p,
  moveToBottom: (p: any) => p,
}));

import { NavDrawer } from "../../src/renderer/components/NavDrawer.tsx";

describe("NavDrawer — 渲染门控", () => {
  beforeEach(() => {
    mockActiveNav = "news";
    cleanup();
  });

  it("section=null → 不渲染 .nav-drawer", () => {
    const { container } = render(<NavDrawer section={null} />);
    expect(container.querySelector(".nav-drawer")).toBeNull();
  });

  it("section=news → 渲染 .nav-drawer + data-section='news'", () => {
    const { container } = render(<NavDrawer section="news" />);
    const drawer = container.querySelector(".nav-drawer");
    expect(drawer).toBeTruthy();
    expect(drawer?.getAttribute("data-section")).toBe("news");
  });
});

describe("NavDrawer — section 过滤", () => {
  beforeEach(() => cleanup());

  it("section=news → 渲染 news section 下 4 个 item (news/ai-leaderboard/games/github, v2.80 删 worldcup)", () => {
    const { container } = render(<NavDrawer section="news" />);
    const items = container.querySelectorAll(".nav-drawer-item");
    expect(items.length).toBe(4);
  });

  it("section=holdings → 渲染 2 个 item (invest/ai-usage)", () => {
    const { container } = render(<NavDrawer section="holdings" />);
    const items = container.querySelectorAll(".nav-drawer-item");
    expect(items.length).toBe(2);
    const keys = Array.from(items).map((it) => it.getAttribute("data-nav"));
    expect(keys).toContain("invest");
    expect(keys).toContain("ai-usage");
  });

  it("section=system → 渲染 1 个 item (versions)", () => {
    const { container } = render(<NavDrawer section="system" />);
    const items = container.querySelectorAll(".nav-drawer-item");
    expect(items.length).toBe(1);
    expect(items[0].getAttribute("data-nav")).toBe("versions");
  });
});

describe("NavDrawer — 选中态", () => {
  beforeEach(() => {
    mockActiveNav = "news";
    cleanup();
  });

  it("activeNav 项加 .nav-drawer-item-active class", () => {
    const { container } = render(<NavDrawer section="news" />);
    const active = container.querySelector(".nav-drawer-item-active");
    expect(active).toBeTruthy();
    expect(active?.getAttribute("data-nav")).toBe("news");
  });

  it("非 active 项不带 .nav-drawer-item-active", () => {
    const { container } = render(<NavDrawer section="news" />);
    const items = container.querySelectorAll(".nav-drawer-item");
    const inactive = Array.from(items).filter(
      (it) => it.getAttribute("data-nav") !== "news"
    );
    inactive.forEach((it) => {
      expect(it.classList.contains("nav-drawer-item-active")).toBe(false);
    });
  });
});

describe("NavDrawer — header 计数", () => {
  beforeEach(() => cleanup());

  it("header 显示 'N 项' 计数 (该 section 可见项数)", () => {
    const { container } = render(<NavDrawer section="news" />);
    const count = container.querySelector(".nav-drawer-count");
    expect(count?.textContent).toBe("4 项");
  });

  it("section 标题来自 NAV_SECTIONS 单一真源", () => {
    const { container } = render(<NavDrawer section="holdings" />);
    const title = container.querySelector(".nav-drawer-title");
    expect(title?.textContent).toBe("持仓");
  });
});

describe("NavDrawer — hover 协同", () => {
  beforeEach(() => cleanup());

  it("mouseenter → onEnter() (AppShell 用来取消关闭延迟)", () => {
    const onEnter = vi.fn();
    const { container } = render(<NavDrawer section="news" onEnter={onEnter} />);
    const drawer = container.querySelector(".nav-drawer") as HTMLElement;
    fireEvent.mouseEnter(drawer);
    expect(onEnter).toHaveBeenCalled();
  });

  it("mouseleave → onLeave() (AppShell 用来启动 150ms 关闭延迟)", () => {
    const onLeave = vi.fn();
    const { container } = render(<NavDrawer section="news" onLeave={onLeave} />);
    const drawer = container.querySelector(".nav-drawer") as HTMLElement;
    fireEvent.mouseLeave(drawer);
    expect(onLeave).toHaveBeenCalled();
  });
});
