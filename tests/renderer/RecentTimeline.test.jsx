// @vitest-environment happy-dom
/**
 * tests/renderer/RecentTimeline.test.jsx
 *
 * Task 17: RecentTimeline — 最近活动时间线. 空显示 empty, 有 items 显示 list.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
import { RecentTimeline } from "../../src/renderer/components/RecentTimeline.jsx";
import { setRecentActivity } from "../../src/renderer/overview-store.js";

beforeEach(() => setRecentActivity([]));

describe("RecentTimeline", () => {
  it("空显示 empty", () => {
    render(<RecentTimeline />);
    expect(screen.getByText("暂无活动")).toBeTruthy();
  });
  it("有 items 显示 list", () => {
    setRecentActivity([{ kind: "upgrade", appName: "vscode", ts: Date.now() }]);
    render(<RecentTimeline />);
    expect(screen.getByText(/vscode/)).toBeTruthy();
  });
});