// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { TopBar } from "../../src/renderer/components/TopBar.jsx";
import { paletteOpen, openPalette, closePalette } from "../../src/renderer/command-palette-store.js";

const { mockVersionsRunCheck } = vi.hoisted(() => ({
  mockVersionsRunCheck: vi.fn(async () => ({ started: true })),
}));

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    detectResultsExport: vi.fn(async () => ({ ok: true })),
    openUrl: vi.fn(),
    versionsRunCheck: mockVersionsRunCheck,
  },
}));

vi.mock("../../src/renderer/route-store.js", () => ({
  navigateTo: vi.fn(),
}));

import { navigateTo } from "../../src/renderer/route-store.js";

beforeEach(() => {
  cleanup();
  closePalette();
  mockVersionsRunCheck.mockClear();
  navigateTo.mockClear();
});

describe("TopBar", () => {
  it("渲染 Pulse logo + search trigger + AI button", () => {
    render(<TopBar />);
    expect(screen.getByText("Pulse")).toBeTruthy();
    expect(screen.getByLabelText("搜索 (Cmd+K)")).toBeTruthy();
    expect(screen.getByLabelText("AI 任务")).toBeTruthy();
  });
  it("search trigger 唤起 palette", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByLabelText("搜索 (Cmd+K)"));
    expect(paletteOpen.value).toBe(true);
  });
  it("Logo 点击跳回应用库 (解决子页无返回入口)", () => {
    render(<TopBar />);
    fireEvent.click(screen.getByTestId("topbar-logo"));
    expect(navigateTo).toHaveBeenCalledWith("library");
  });
  it("刷新按钮点击触发 api.versionsRunCheck 并置 loading", async () => {
    render(<TopBar />);
    const btn = screen.getByTestId("topbar-run-check");
    fireEvent.click(btn);
    await waitFor(() => expect(mockVersionsRunCheck).toHaveBeenCalledTimes(1));
    // loading 期间 aria-busy=true (用户能看到旋转反馈, 不再"点不动")
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });
});