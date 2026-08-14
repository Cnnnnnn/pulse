// @vitest-environment happy-dom
/**
 * tests/renderer/dashboard.test.tsx
 *
 * Phase 9 收尾补测 — Dashboard 是新首页 (替代老 HomeGrid 磁贴网格).
 *
 * 行为契约:
 *   - 渲染 4 个区: Hero / Summary row / Tiles (按 section 分组) / Recent (可选)
 *   - Hero 包含时段问候 + 时间 + 日期
 *   - Summary row 固定 3 个 card: news / invest / ai-usage
 *   - Tiles 按 NAV_SECTIONS 分组渲染 (3 section: news/holdings/system)
 *   - Recent 仅在 recent.value 非空时显示
 *   - 不带任何 .side-nav / .home-grid 老 class (Phase 9 收尾)
 *
 * Mock 策略: 整个 mock nav-status.ts (返回空 ctx + 真实 greeting/fmtTime/fmtDate),
 * 避免真实 store 链 (ithome/funds/metals/...) 在 happy-dom 下加载失败.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/preact";

let mockActiveNav = "home";
const mockSetActiveNav = vi.fn();
const mockGoInvest = vi.fn();
let mockRecent: any[] | null = [];
let mockRecentLoaded = true;

vi.mock("../../src/renderer/nav/navStore.ts", () => ({
  get activeNav() {
    return { get value() { return mockActiveNav; } };
  },
  setActiveNav: (k: string) => mockSetActiveNav(k),
  goInvest: (k?: string) => mockGoInvest(k),
}));

vi.mock("../../src/renderer/recent/recentStore.ts", () => ({
  get recent() {
    return { get value() { return mockRecent; } };
  },
  get recentLoaded() {
    return { get value() { return mockRecentLoaded; } };
  },
  loadRecent: vi.fn(),
}));

vi.mock("../../src/renderer/components/nav-status.ts", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // 喂空 ctx: 所有 badge=null, status=null — 测试只查 DOM 结构, 不查副标题数值
    collectNavStatusCtx: () => ({
      ithomeUnread: 0,
      wechatHotUnread: 0,
      fundUnread: 0,
      aiUsageNavBadge: 0,
      ithomeDayStats: null,
      ithomeArticles: null,
      wechatHotItems: null,
      holdings: null,
      totalMetrics: null,
      quoteCache: null,
      comparePoolCount: 0,
      stocksResults: null,
      aiUsageActiveProvider: null,
      aiUsageSnapshot: null,
      checkResults: null,
      checkApps: null,
      githubProjects: null,
    }),
    getBadge: () => null,
    getStatus: () => null,
    // greeting/fmtTime/fmtDate 走 actual, 纯函数, 跟 Date() 相关
  };
});

import { Dashboard } from "../../src/renderer/components/Dashboard.tsx";

describe("Dashboard — 4 个区结构", () => {
  beforeEach(() => {
    mockActiveNav = "home";
    mockRecent = [];
    cleanup();
  });

  it("渲染 .dashboard-root + Hero + Summary row + Tiles", () => {
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".dashboard-root")).toBeTruthy();
    expect(container.querySelector(".dashboard-hero")).toBeTruthy();
    expect(container.querySelector(".dashboard-summary-row")).toBeTruthy();
    expect(container.querySelector(".dashboard-tiles")).toBeTruthy();
  });

  it("Hero 包含时段问候 (早上/中午/下午/晚上/夜深)", () => {
    const { container } = render(<Dashboard />);
    const heroGreeting = container.querySelector(".dashboard-hero-greeting");
    // 跨时段兼容 — Date().getHours() 决定, 取一个子集断言
    expect(heroGreeting?.textContent).toMatch(/早上好|中午好|下午好|晚上好|夜深了/);
  });

  it("Hero 时间格式 HH:MM", () => {
    const { container } = render(<Dashboard />);
    const time = container.querySelector(".dashboard-hero-time");
    expect(time?.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it("Summary row 固定 3 个 card (news/invest/ai-usage)", () => {
    const { container } = render(<Dashboard />);
    const cards = container.querySelectorAll(".dashboard-summary-card");
    expect(cards.length).toBe(3);
  });
});

describe("Dashboard — Tiles 按 section 分组", () => {
  beforeEach(() => {
    mockActiveNav = "home";
    cleanup();
  });

  it("3 个 section 分组 (news/holdings/system), 来自 NAV_SECTIONS 单一真源", () => {
    const { container } = render(<Dashboard />);
    const sections = container.querySelectorAll(".dashboard-tile-section");
    expect(sections.length).toBe(3);
    const labels = Array.from(
      container.querySelectorAll(".dashboard-tile-section-label")
    ).map((el) => el.textContent);
    expect(labels).toEqual(["资讯", "持仓", "系统"]);
  });

  it("tiles 数 = NAV_REGISTRY 数 (6 个非 home module, v2.80 删 worldcup)", () => {
    const { container } = render(<Dashboard />);
    const tiles = container.querySelectorAll(".dashboard-tile");
    expect(tiles.length).toBe(6);
  });
});

describe("Dashboard — Recent 条件渲染", () => {
  beforeEach(() => {
    mockActiveNav = "home";
    cleanup();
  });

  it("recent 空 → 不渲染 .dashboard-recent", () => {
    mockRecent = [];
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".dashboard-recent")).toBeNull();
  });

  it("recent null → 不渲染 .dashboard-recent", () => {
    mockRecent = null;
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".dashboard-recent")).toBeNull();
  });

  it("recent 有数据 → 渲染 .dashboard-recent + item 列表 (上限 4 条, 屏幕缩小不被挡)", () => {
    mockRecent = Array.from({ length: 10 }, (_, i) => ({
      kind: "fund-view",
      title: `基金 ${i}`,
      ts: Date.now() - i * 60_000,
    }));
    const { container } = render(<Dashboard />);
    const items = container.querySelectorAll(".dashboard-recent-item");
    expect(items.length).toBe(4); // 上限 4 条 (用户反馈: 屏幕小被挡, 6 → 4)
  });
});

describe("Dashboard — Phase 9 收尾: 不带老 class", () => {
  beforeEach(() => {
    mockActiveNav = "home";
    cleanup();
  });

  it("不使用 .home-grid / .side-nav 老 class (Phase 9 收尾)", () => {
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".home-grid")).toBeNull();
    expect(container.querySelector(".side-nav")).toBeNull();
  });
});
