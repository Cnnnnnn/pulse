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
  waitFor,
} from "@testing-library/preact";
import { SettingsPage } from "../../src/renderer/components/SettingsPage.tsx";

beforeEach(() => {
  // happy-dom 下没有 preload bridge, 注入最小 stub 让 useEffect 不 throw
  window.api = {
    remindersList: async () => ({ ok: true, reminders: [] }),
    recentList: async () => ({ ok: true, entries: [] }),
    onRecentUpdated: () => () => {},
    onRemindersFired: () => () => {},
    appGetVersion: async () => "2.82.0",
    selfUpdateGetState: async () => ({
      ok: true,
      state: {
        status: "idle",
        available: false,
        version: null,
        releaseNotes: null,
        downloadPercent: 0,
        readyToInstall: false,
        error: null,
        lastCheckedAt: null,
      },
    }),
    selfUpdateCheck: async () => ({ ok: true }),
    selfUpdateInstall: async () => ({ ok: true }),
  };
});

afterEach(cleanup);

describe("SettingsPage", () => {
  it("渲染 title", () => {
    render(<SettingsPage />);
    expect(screen.getByText("设置")).toBeTruthy();
  });

  it("关于 Pulse 显示当前版本并提供检查新版本按钮", async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByTestId("settings-app-version").textContent).toBe("v2.82.0"));
    const button = screen.getByRole("button", { name: "检查新版本" });
    expect(button).toBeTruthy();
    fireEvent.click(button);
  });

  it("关于 Pulse 使用紧凑双列布局", async () => {
    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(container.querySelector(".settings-about__content")).toBeTruthy());
    const about = container.querySelector("[aria-labelledby=\"settings-about-title\"]");
    expect(about.querySelectorAll(".settings-about__item").length).toBe(2);
    expect(about.querySelector(".settings-about__version")).toBeTruthy();
  });

});
