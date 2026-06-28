// @vitest-environment happy-dom
/**
 * tests/renderer/WatchlistModal.test.jsx
 *
 * Phase 33: WatchlistModal 单元测试 (替代原 WatchlistDrawer.test.jsx).
 *
 * 覆盖:
 *   - 关闭时不渲染
 *   - 打开时 refresh + 渲染 type 分组 (4 个 section)
 *   - filter chips 过滤 (all / app / fund / metal / keyword)
 *   - 移除按钮调 api.watchlistRemove
 *   - 浮层 click 关闭
 *   - 关闭按钮关闭
 *   - 关键词表单可添加
 *   - 关键词表单清空
 *   - section 折叠/展开
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

const mockApi = {
  watchlistList: vi.fn(() => Promise.resolve({ ok: true, items: [] })),
  watchlistAdd: vi.fn((opts) =>
    Promise.resolve({
      ok: true,
      items: [{ type: opts.type, ref: opts.ref, addedAt: Date.now() }],
    }),
  ),
  watchlistRemove: vi.fn(() => Promise.resolve({ ok: true, items: [] })),
};

vi.mock("../../src/renderer/api.js", () => ({
  get api() {
    return mockApi;
  },
}));

vi.mock("../../metals/metal-config.js", () => ({
  getMetalById: (id) => (id === "XAU" ? { shortName: "黄金" } : null),
}));

import {
  watchlistItems,
  watchlistModalOpen,
} from "../../src/renderer/watchlist/watchlist-store.js";
import { WatchlistModal } from "../../src/renderer/components/WatchlistModal.jsx";

beforeEach(() => {
  cleanup();
  watchlistItems.value = [];
  watchlistModalOpen.value = false;
  mockApi.watchlistList.mockClear();
  mockApi.watchlistAdd.mockClear();
  mockApi.watchlistRemove.mockClear();
});

describe("WatchlistModal", () => {
  it("关闭时不渲染", () => {
    watchlistModalOpen.value = false;
    const { container } = render(<WatchlistModal />);
    expect(container.querySelector(".watchlist-modal")).toBeNull();
  });

  it("打开时 refresh + 渲染 4 个 type section", async () => {
    watchlistItems.value = [
      { type: "app", ref: "VSCode", addedAt: 1000, lastNotifiedVersion: "1.95.3" },
      { type: "fund", ref: "000001", addedAt: 2000, lastNotifiedNav: null },
      { type: "metal", ref: "XAU", addedAt: 3000, lastNotifiedPrice: null },
      { type: "keyword", ref: "AI", addedAt: 4000, lastMatchKey: null },
    ];
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    expect(mockApi.watchlistList).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-testid='watchlist-section-app']")).toBeTruthy();
    expect(container.querySelector("[data-testid='watchlist-section-fund']")).toBeTruthy();
    expect(container.querySelector("[data-testid='watchlist-section-metal']")).toBeTruthy();
    expect(container.querySelector("[data-testid='watchlist-section-keyword']")).toBeTruthy();
    expect(container.textContent).toContain("VSCode");
    expect(container.textContent).toContain("1.95.3");
    expect(container.textContent).toContain("黄金");
    expect(container.textContent).toContain("AI");
  });

  it("filter chips 过滤 type (keyword 只显示 keyword)", async () => {
    watchlistItems.value = [
      { type: "app", ref: "VSCode", addedAt: 1, lastNotifiedVersion: null },
      { type: "keyword", ref: "AI", addedAt: 2, lastMatchKey: null },
    ];
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    fireEvent.click(container.querySelector("[data-testid='watchlist-filter-keyword']"));
    expect(container.querySelector("[data-testid='watchlist-section-app']")).toBeTruthy(); // section 仍渲染
    const appSection = container.querySelector("[data-testid='watchlist-section-app']");
    const kwSection = container.querySelector("[data-testid='watchlist-section-keyword']");
    expect(appSection.querySelectorAll(".watchlist-row").length).toBe(0);
    expect(kwSection.querySelectorAll(".watchlist-row").length).toBe(1);
    expect(kwSection.textContent).toContain("AI");
  });

  it("点 移除 调 api.watchlistRemove 并清空该项", async () => {
    watchlistItems.value = [
      { type: "app", ref: "VSCode", addedAt: 1, lastNotifiedVersion: null },
    ];
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    const removeBtn = container.querySelector("[data-testid='watchlist-remove']");
    expect(removeBtn).not.toBeNull();
    fireEvent.click(removeBtn);
    expect(mockApi.watchlistRemove).toHaveBeenCalledWith({
      type: "app",
      ref: "VSCode",
    });
  });

  it("浮层 click 关闭", () => {
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    const overlay = container.querySelector(".watchlist-modal-backdrop");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay);
    expect(watchlistModalOpen.value).toBe(false);
  });

  it("关闭按钮也关闭", () => {
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    const closeBtn = container.querySelector("[data-testid='watchlist-close']");
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);
    expect(watchlistModalOpen.value).toBe(false);
  });

  it("关键词 form submit 后调 watchlistAdd + 清空 input", async () => {
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    const input = container.querySelector("[data-testid='watchlist-add-input']");
    const form = container.querySelector("[data-testid='watchlist-add-form']");
    fireEvent.input(input, { target: { value: "热搜" } });
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockApi.watchlistAdd).toHaveBeenCalledWith({
      type: "keyword",
      ref: "热搜",
    });
    expect(input.value).toBe("");
  });

  it("section 可折叠: 点击 header 收起再展开", async () => {
    watchlistItems.value = [
      { type: "app", ref: "VSCode", addedAt: 1, lastNotifiedVersion: null },
    ];
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    const section = container.querySelector("[data-testid='watchlist-section-app']");
    expect(section.querySelectorAll(".watchlist-row").length).toBe(1);
    fireEvent.click(container.querySelector("[data-testid='watchlist-toggle-app']"));
    expect(section.querySelectorAll(".watchlist-row").length).toBe(0);
    fireEvent.click(container.querySelector("[data-testid='watchlist-toggle-app']"));
    expect(section.querySelectorAll(".watchlist-row").length).toBe(1);
  });

  it("filter chip 显示 type 计数 (count badge)", () => {
    watchlistItems.value = [
      { type: "app", ref: "A", addedAt: 1, lastNotifiedVersion: null },
      { type: "app", ref: "B", addedAt: 2, lastNotifiedVersion: null },
      { type: "keyword", ref: "AI", addedAt: 3, lastMatchKey: null },
    ];
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    const appChip = container.querySelector("[data-testid='watchlist-filter-app']");
    expect(appChip.textContent).toContain("2");
  });

  it("空 items 时显示空态文案", () => {
    watchlistItems.value = [];
    watchlistModalOpen.value = true;
    const { container } = render(<WatchlistModal />);
    expect(container.querySelector(".watchlist-empty")).toBeTruthy();
    expect(container.textContent).toContain("还没有关注");
    expect(container.textContent).toContain("关键词");
  });
});
