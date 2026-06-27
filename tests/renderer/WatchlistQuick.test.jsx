// @vitest-environment happy-dom
/**
 * tests/renderer/WatchlistQuick.test.jsx
 *
 * Task 17: WatchlistQuick — 关注列表速览. 空显示 empty, 有 items 显示 list + badge.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { WatchlistQuick } from "../../src/renderer/components/WatchlistQuick.jsx";
import { setWatchlistQuick } from "../../src/renderer/overview-store.js";

beforeEach(() => setWatchlistQuick([]));

describe("WatchlistQuick", () => {
  it("空显示 empty", () => {
    render(<WatchlistQuick />);
    expect(screen.getByText(/暂无关注/)).toBeTruthy();
  });
  it("有 items 显示 list", () => {
    setWatchlistQuick([{ name: "vscode", has_update: true }, { name: "chrome", has_update: false }]);
    render(<WatchlistQuick />);
    expect(screen.getByText("vscode")).toBeTruthy();
    expect(screen.getByText("chrome")).toBeTruthy();
    expect(screen.getByText("有更新")).toBeTruthy();
  });
});