// @vitest-environment happy-dom
/**
 * tests/renderer/SettingsPage.test.jsx
 *
 * P13 — SettingsPage 重做后, 仅保证 title 渲染 (无 IPC 依赖).
 *   IPC/交互由 Playwright visual + 手动覆盖.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/preact";
import { SettingsPage } from "../../src/renderer/components/SettingsPage.jsx";

beforeEach(() => {
  // happy-dom 下没有 preload bridge, 注入最小 stub 让 useEffect 不 throw
  window.api = {
    remindersList: async () => ({ ok: true, reminders: [] }),
    recentList: async () => ({ ok: true, entries: [] }),
    onRecentUpdated: () => () => {},
    onRemindersFired: () => () => {},
  };
});

afterEach(cleanup);

describe("SettingsPage", () => {
  it("渲染 title", () => {
    render(<SettingsPage />);
    expect(screen.getByText("设置")).toBeTruthy();
  });

  it("游戏设置展示免费活动新文案且无旧用户文案", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "游戏" }));

    expect(screen.getByText("免费活动自动检查")).toBeTruthy();
    expect(screen.getByText("自动检查免费活动")).toBeTruthy();
    expect(screen.getByText("发现新免费活动时桌面通知")).toBeTruthy();
    expect(
      screen.getByText(/定时检查 Epic、Steam 和 Xbox 免费活动/),
    ).toBeTruthy();
    expect(screen.queryByText("喜+1 自动检查")).toBeNull();
    expect(screen.queryByText("自动检查 Epic 喜+1")).toBeNull();
    expect(screen.queryByText("发现新喜+1 时桌面通知")).toBeNull();
  });
});