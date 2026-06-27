// @vitest-environment happy-dom
// T6: TopBar 8 dead button wiring.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { TopBar } from "../../src/renderer/components/TopBar.jsx";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    detectResultsExport: vi.fn(async () => ({ ok: true })),
    versionsRunCheck: vi.fn(async () => ({ started: true })),
  },
}));

vi.mock("../../src/renderer/route-store.js", () => ({
  navigateTo: vi.fn(),
}));

vi.mock("../../src/renderer/store/toast-store.js", () => ({
  showToast: vi.fn(),
}));

import { navigateTo } from "../../src/renderer/route-store.js";
import { showToast } from "../../src/renderer/store/toast-store.js";
import { api } from "../../src/renderer/api.js";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TopBar 8 dead button wiring (T6)", () => {
  it("'检查更新' button calls api.versionsRunCheck", () => {
    const { container } = render(<TopBar />);
    const btn = container.querySelector('[data-testid="topbar-run-check"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(api.versionsRunCheck).toHaveBeenCalledTimes(1);
  });

  it("'AI 任务' button navigates to insights", () => {
    const { container } = render(<TopBar />);
    const btn = container.querySelector('[data-testid="topbar-ai-tasks"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(navigateTo).toHaveBeenCalledWith("insights");
  });

  it("'通知' button navigates to diagnostics", () => {
    const { container } = render(<TopBar />);
    const btn = container.querySelector('[data-testid="topbar-notification"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(navigateTo).toHaveBeenCalledWith("diagnostics");
  });

  it("overflow menu: 诊断 (diagnostics) navigates to diagnostics", () => {
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector('[data-testid="topbar-overflow-toggle"]'));
    const btn = container.querySelector('[data-testid="topbar-menu-diagnostics"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(navigateTo).toHaveBeenCalledWith("diagnostics");
  });

  it("overflow menu: 关注列表 (watchlist) navigates to library", () => {
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector('[data-testid="topbar-overflow-toggle"]'));
    const btn = container.querySelector('[data-testid="topbar-menu-watchlist"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(navigateTo).toHaveBeenCalledWith("library");
  });

  it("overflow menu: Reminders navigates to settings", () => {
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector('[data-testid="topbar-overflow-toggle"]'));
    const btn = container.querySelector('[data-testid="topbar-menu-reminders"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(navigateTo).toHaveBeenCalledWith("settings");
  });

  it("overflow menu: Recent navigates to settings", () => {
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector('[data-testid="topbar-overflow-toggle"]'));
    const btn = container.querySelector('[data-testid="topbar-menu-recent"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(navigateTo).toHaveBeenCalledWith("settings");
  });

  it("overflow menu: Release Notes toasts (TBD, IPC missing per YAGNI)", () => {
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector('[data-testid="topbar-overflow-toggle"]'));
    const btn = container.querySelector('[data-testid="topbar-menu-release-notes"]');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    // versionsOpenReleaseNotes doesn't exist; per YAGNI, button is no-op with toast feedback.
    expect(showToast).toHaveBeenCalled();
  });
});
