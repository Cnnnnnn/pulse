// @vitest-environment happy-dom
/**
 * tests/renderer/overview-recent-mini.test.jsx
 *
 * v2.50 (T3): OverviewRecentMini — 列 3: 最近活动 mini 视图.
 * 最近 5 条事件 + 相对时间 + View all 链接 + 空态.
 * 事件 shape 由 prop 传入 (mock shape, 不直连 track.js — T5 接线).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/preact";
import { signal } from "@preact/signals";
import { OverviewRecentMini } from "../../src/renderer/components/OverviewRecentMini.jsx";

describe("OverviewRecentMini", () => {
  let events;
  beforeEach(() => {
    events = signal([]);
  });

  it("shows 5 most recent events with relative time", () => {
    act(() => {
      events.value = [
        { type: "upgrade", description: "vscode → 1.85.0", timestamp: Date.now() - 120000 },
        { type: "check", description: "检查完成 · 11 个", timestamp: Date.now() - 300000 },
        { type: "error", description: "slack 失败", timestamp: Date.now() - 3600000 },
        { type: "snooze", description: "figma 静音 7d", timestamp: Date.now() - 10800000 },
        { type: "star", description: "+ iterm2 关注", timestamp: Date.now() - 86400000 },
        { type: "upgrade", description: "node → 20.11", timestamp: Date.now() - 90000000 },
      ];
    });
    const { container } = render(<OverviewRecentMini events={events} onViewAll={() => {}} />);
    const items = container.querySelectorAll(".recent-item");
    expect(items).toHaveLength(5);
    expect(container.textContent).toContain("2m");
    expect(container.textContent).toContain("5m");
    expect(container.textContent).toContain("1h");
  });

  it("renders type labels (升/查/错/静/星) for known types", () => {
    act(() => {
      events.value = [
        { type: "upgrade", description: "vscode → 1.85.0", timestamp: Date.now() - 120000 },
        { type: "check", description: "检查完成", timestamp: Date.now() - 300000 },
        { type: "error", description: "slack 失败", timestamp: Date.now() - 3600000 },
        { type: "snooze", description: "figma 静音", timestamp: Date.now() - 10800000 },
        { type: "star", description: "+ iterm2 关注", timestamp: Date.now() - 86400000 },
      ];
    });
    const { container } = render(<OverviewRecentMini events={events} onViewAll={() => {}} />);
    const text = container.textContent;
    expect(text).toContain("升");
    expect(text).toContain("查");
    expect(text).toContain("错");
    expect(text).toContain("静");
    expect(text).toContain("星");
  });

  it("shows 'View all' link in header", () => {
    act(() => {
      events.value = [
        { type: "upgrade", description: "vscode → 1.85.0", timestamp: Date.now() - 120000 },
      ];
    });
    const { container } = render(<OverviewRecentMini events={events} onViewAll={() => {}} />);
    expect(container.textContent).toContain("View all");
  });

  it("calls onViewAll when 'View all' button is clicked", () => {
    act(() => {
      events.value = [
        { type: "upgrade", description: "vscode → 1.85.0", timestamp: Date.now() - 120000 },
      ];
    });
    let called = 0;
    const { container } = render(
      <OverviewRecentMini events={events} onViewAll={() => { called++; }} />
    );
    const link = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("View all")
    );
    link.click();
    expect(called).toBe(1);
  });

  it("shows empty state when no events", () => {
    const { container } = render(<OverviewRecentMini events={events} onViewAll={() => {}} />);
    expect(container.textContent).toContain("还没有活动");
  });

  it("uses role=list / role=listitem a11y semantics", () => {
    act(() => {
      events.value = [
        { type: "upgrade", description: "vscode → 1.85.0", timestamp: Date.now() - 120000 },
      ];
    });
    const { container } = render(<OverviewRecentMini events={events} onViewAll={() => {}} />);
    expect(container.querySelector('[role="list"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(1);
  });
});
