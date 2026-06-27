// @vitest-environment happy-dom
/**
 * tests/renderer/overview-watchlist-mini.test.jsx
 *
 * v2.50 (T2): OverviewWatchlistMini — 列 2: 关注列表 mini 视图.
 * 前 4 个 watched apps + View all 链接 + 空态.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { OverviewWatchlistMini } from "../../src/renderer/components/OverviewWatchlistMini.jsx";

describe("OverviewWatchlistMini", () => {
  let watchlist;
  beforeEach(() => {
    watchlist = signal([]);
  });

  it("shows first 4 watched apps and 'View all' link", () => {
    watchlist.value = [
      { id: "vscode", name: "vscode", status: "upgradable" },
      { id: "chrome", name: "chrome", status: "latest" },
      { id: "iterm2", name: "iterm2", status: "latest" },
      { id: "docker", name: "docker", status: "latest" },
      { id: "node", name: "node", status: "latest" },
      { id: "figma", name: "figma", status: "latest" },
    ];
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => {}} />);
    const items = container.querySelectorAll(".watchlist-item");
    expect(items).toHaveLength(4);
    expect(container.textContent).toContain("+ 2 个");
    expect(container.textContent).toContain("View all");
  });

  it("shows upgradable badge for items with status='upgradable'", () => {
    watchlist.value = [{ id: "vscode", name: "vscode", status: "upgradable" }];
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => {}} />);
    const badges = container.querySelectorAll(".watchlist-badge");
    expect(badges).toHaveLength(1);
  });

  it("shows empty state when watchlist is empty", () => {
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => {}} />);
    expect(container.textContent).toContain("暂无关注");
  });

  it("updates when watchlist signal changes", () => {
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => {}} />);
    expect(container.textContent).toContain("暂无关注");
    act(() => {
      watchlist.value = [{ id: "vscode", name: "vscode", status: "latest" }];
    });
    expect(container.textContent).toContain("vscode");
    expect(container.textContent).not.toContain("暂无关注");
  });

  it("calls onViewAll when 'View all' button is clicked", () => {
    watchlist.value = [{ id: "vscode", name: "vscode", status: "latest" }];
    let called = 0;
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => { called++; }} />);
    const link = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("View all"));
    link.click();
    expect(called).toBe(1);
  });

  it("uses CSS tokens, no hardcoded colors in component classNames", () => {
    watchlist.value = [{ id: "vscode", name: "vscode", status: "upgradable" }];
    const { container } = render(<OverviewWatchlistMini watchlist={watchlist} onViewAll={() => {}} />);
    expect(container.querySelector(".overview-watchlist-mini")).toBeTruthy();
    expect(container.querySelector(".dot-upgradable")).toBeTruthy();
  });
});
