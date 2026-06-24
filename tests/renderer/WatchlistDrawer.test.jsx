// @vitest-environment happy-dom
/**
 * tests/renderer/WatchlistDrawer.test.jsx
 *
 * 2026-06-23: I2 v1 — WatchlistDrawer 单元测试.
 *
 * 覆盖:
 *   - 抽屉关闭时不渲染列表
 *   - 打开时 refresh + 渲染列表
 *   - 空态文案
 *   - 点 "去 pin" 调 api.watchlistRemove
 *   - 浮层 click 关闭
 *   - Header btn-watchlist 显示 ★/☆ 根据 count
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { signal } from "@preact/signals";

// ─── mock api (vi.mock factory hoists, 不能引用顶层变量; 但 vi.fn() 是 spy) ──
const mockApi = {
  watchlistList: vi.fn(() => Promise.resolve({ ok: true, items: [] })),
  watchlistAdd: vi.fn((appName) =>
    Promise.resolve({
      ok: true,
      items: [{ appName, addedAt: Date.now(), lastNotifiedVersion: null }],
    }),
  ),
  watchlistRemove: vi.fn(() => Promise.resolve({ ok: true, items: [] })),
};

// factory 内部用 module-level 的变量是不安全的 (hoist), 但 vi.fn() 是 lazy:
// 用 inline forwarder 指向 mockApi, vi.clearAllMocks 后 mockApi 仍是 vi.fn().
vi.mock("../../src/renderer/api.js", () => ({
  get api() {
    return mockApi;
  },
}));

// We need to reset the watchlist store between tests
import {
  watchlistItems,
  watchlistDrawerOpen,
} from "../../src/renderer/watchlist/watchlist-store.js";
import { WatchlistDrawer } from "../../src/renderer/components/WatchlistDrawer.jsx";
import { Header } from "../../src/renderer/components/Header.jsx";

beforeEach(() => {
  cleanup();
  watchlistItems.value = [];
  watchlistDrawerOpen.value = false;
  mockApi.watchlistList.mockClear();
  mockApi.watchlistAdd.mockClear();
  mockApi.watchlistRemove.mockClear();
});

describe("WatchlistDrawer", () => {
  it("关闭时不渲染", () => {
    watchlistDrawerOpen.value = false;
    const { container } = render(<WatchlistDrawer />);
    expect(container.querySelector(".watchlist-drawer")).toBeNull();
  });

  it("打开时 refresh + 渲染列表", async () => {
    watchlistItems.value = [
      { type: "app", ref: "VSCode", addedAt: 1000, lastNotifiedVersion: "1.95.3" },
      { type: "app", ref: "Slack", addedAt: 2000, lastNotifiedVersion: null },
    ];
    watchlistDrawerOpen.value = true;
    const { container } = render(<WatchlistDrawer />);
    expect(mockApi.watchlistList).toHaveBeenCalledOnce();
    const entries = container.querySelectorAll(".watchlist-entry");
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toContain("VSCode");
    expect(entries[0].textContent).toContain("1.95.3");
    expect(entries[1].textContent).toContain("Slack");
    expect(entries[1].textContent).toContain("尚未通知");
  });

  it("空态文案", () => {
    watchlistItems.value = [];
    watchlistDrawerOpen.value = true;
    const { container } = render(<WatchlistDrawer />);
    const empty = container.querySelector(".watchlist-drawer__empty");
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain("关键词");
  });

  it("点 去 pin 调 api.watchlistRemove", async () => {
    watchlistItems.value = [
      { type: "app", ref: "VSCode", addedAt: 1, lastNotifiedVersion: null },
    ];
    watchlistDrawerOpen.value = true;
    const { container } = render(<WatchlistDrawer />);
    const removeBtn = container.querySelector(".watchlist-entry button");
    expect(removeBtn).not.toBeNull();
    fireEvent.click(removeBtn);
    expect(mockApi.watchlistRemove).toHaveBeenCalledWith({
      type: "app",
      ref: "VSCode",
    });
  });

  it("浮层 click 关闭", () => {
    watchlistDrawerOpen.value = true;
    const { container } = render(<WatchlistDrawer />);
    const overlay = container.querySelector(".watchlist-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay);
    expect(watchlistDrawerOpen.value).toBe(false);
  });

  it("关闭按钮也关闭", () => {
    watchlistDrawerOpen.value = true;
    const { container } = render(<WatchlistDrawer />);
    const closeBtn = container.querySelector(".watchlist-drawer__close");
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);
    expect(watchlistDrawerOpen.value).toBe(false);
  });

  it("stats 显示当前 count", () => {
    watchlistItems.value = [
      { type: "app", ref: "A", addedAt: 1, lastNotifiedVersion: null },
      { type: "fund", ref: "000001", addedAt: 2, lastNotifiedNav: null },
      { type: "keyword", ref: "AI", addedAt: 3, lastMatchKey: null },
    ];
    watchlistDrawerOpen.value = true;
    const { container } = render(<WatchlistDrawer />);
    const stats = container.querySelector(".watchlist-drawer__stats");
    expect(stats.textContent).toContain("3");
  });
});

describe("Header btn-watchlist", () => {
  it("空 list 显示 ☆", () => {
    watchlistItems.value = [];
    const { container } = render(<Header onCheck={() => {}} />);
    const btn = container.querySelector("#btn-watchlist");
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe("☆");
  });

  it("非空 list 显示 ★", () => {
    watchlistItems.value = [
      { type: "app", ref: "A", addedAt: 1, lastNotifiedVersion: null },
    ];
    const { container } = render(<Header onCheck={() => {}} />);
    const btn = container.querySelector("#btn-watchlist");
    expect(btn.textContent).toBe("★");
    expect(btn.getAttribute("title")).toContain("1");
  });

  it("点 btn-watchlist 切 watchlistDrawerOpen", () => {
    watchlistDrawerOpen.value = false;
    const { container } = render(<Header onCheck={() => {}} />);
    const btn = container.querySelector("#btn-watchlist");
    fireEvent.click(btn);
    expect(watchlistDrawerOpen.value).toBe(true);
  });
});