/**
 * tests/renderer/ithome-news-sidebar.test.tsx
 *
 * NewsSidebar 阅读进度增强：未读 badge + 进度条渲染逻辑。
 * 非收藏模式下：total=N, read=R → badge 显示未读 (N-R)，进度条宽度 R/N。
 */

// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";

const {
  mockViewMode,
  mockSelectedDate,
  mockArticles,
  mockDayStats,
  mockFavorites,
  mockReadIds,
} = vi.hoisted(() => ({
  mockViewMode: { value: "news" },
  mockSelectedDate: { value: "2026-06-12" },
  mockArticles: { value: {} },
  mockDayStats: { value: {} },
  mockFavorites: { value: {} },
  mockReadIds: { value: {} },
}));

vi.mock("../../src/renderer/ithome/store.ts", () => ({
  ithomeViewMode: mockViewMode,
  ithomeSelectedDate: mockSelectedDate,
  ithomeFavoriteSelectedDate: { value: "" },
  ithomeArticles: mockArticles,
  ithomeDayStats: mockDayStats,
  ithomeFavorites: mockFavorites,
  ithomeReadIds: mockReadIds,
  setIthomeSelectedDate: vi.fn(),
  setIthomeFavoriteSelectedDate: vi.fn(),
}));

// monthDayRange / favoriteDateKeys 等走真实 news-utils，不受 mock 影响。
// 固定"今天"为 2026-06-12 让 monthDayRange 稳定。
vi.stubGlobal("Date", class extends Date {
  constructor(ts?: number | string) {
    if (ts === undefined) super("2026-06-12T12:00:00+08:00");
    else super(ts as any);
  }
});

import { NewsSidebar } from "../../src/renderer/ithome/NewsSidebar.tsx";

describe("NewsSidebar 阅读进度", () => {
  afterEach(() => cleanup());

  it("有未读 → badge 显示未读数 + has-unread class", () => {
    // 5 篇，已读 2 → 未读 3
    mockArticles.value = {
      a1: { id: "a1", dateKey: "2026-06-12", pubDate: "2026-06-12T10:00:00+08:00" },
      a2: { id: "a2", dateKey: "2026-06-12", pubDate: "2026-06-12T09:00:00+08:00" },
      a3: { id: "a3", dateKey: "2026-06-12", pubDate: "2026-06-12T08:00:00+08:00" },
      a4: { id: "a4", dateKey: "2026-06-12", pubDate: "2026-06-12T07:00:00+08:00" },
      a5: { id: "a5", dateKey: "2026-06-12", pubDate: "2026-06-12T06:00:00+08:00" },
    };
    mockDayStats.value = {};
    mockReadIds.value = { a1: 1, a2: 1 };
    mockSelectedDate.value = "2026-06-12";

    const { container } = render(<NewsSidebar />);
    const todayItem = container.querySelector('.ithome-sidebar-item.is-today');
    expect(todayItem).toBeTruthy();
    expect(todayItem.classList.contains("has-unread")).toBe(true);
    // badge 文本应为未读数 3
    const badge = todayItem.querySelector(".ithome-sidebar-item-badge");
    expect(badge?.textContent).toBe("3");
    expect(badge?.classList.contains("is-unread")).toBe(true);
    // 进度条应存在，宽度 = 2/5 = 40%
    const fill = todayItem.querySelector(".ithome-sidebar-item-progress-fill");
    expect(fill).toBeTruthy();
    expect((fill as HTMLElement).style.width).toBe("40%");
  });

  it("全部已读 → badge 显示总数 + is-all-read class + 进度条满", () => {
    mockArticles.value = {
      a1: { id: "a1", dateKey: "2026-06-12", pubDate: "2026-06-12T10:00:00+08:00" },
      a2: { id: "a2", dateKey: "2026-06-12", pubDate: "2026-06-12T09:00:00+08:00" },
    };
    mockDayStats.value = {};
    mockReadIds.value = { a1: 1, a2: 1 };
    mockSelectedDate.value = "2026-06-12";

    const { container } = render(<NewsSidebar />);
    const todayItem = container.querySelector('.ithome-sidebar-item.is-today');
    expect(todayItem?.classList.contains("is-all-read")).toBe(true);
    expect(todayItem?.classList.contains("has-unread")).toBe(false);
    // badge 显示已读数（未读=0 时 fallback 显 read）
    expect(todayItem?.querySelector(".ithome-sidebar-item-badge")?.textContent).toBe("2");
    const fill = todayItem?.querySelector(".ithome-sidebar-item-progress-fill") as HTMLElement;
    expect(fill?.style.width).toBe("100%");
  });

  it("无文章 → 不渲染 badge 也不渲染进度条", () => {
    mockArticles.value = {};
    mockDayStats.value = {};
    mockReadIds.value = {};
    mockSelectedDate.value = "2026-06-12";

    const { container } = render(<NewsSidebar />);
    const todayItem = container.querySelector('.ithome-sidebar-item.is-today');
    expect(todayItem?.querySelector(".ithome-sidebar-item-badge")).toBeNull();
    expect(todayItem?.querySelector(".ithome-sidebar-item-progress")).toBeNull();
  });
});
