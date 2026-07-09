// @vitest-environment happy-dom
/**
 * tests/renderer/SettingsPage.test.jsx
 *
 * P13 — SettingsPage 重做后, 仅保证 title 渲染 (无 IPC 依赖).
 *   IPC/交互由 Playwright visual + 手动覆盖.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/preact";
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

describe("SettingsPage", () => {
  it("渲染 title", () => {
    render(<SettingsPage />);
    expect(screen.getByText("设置")).toBeTruthy();
  });
});