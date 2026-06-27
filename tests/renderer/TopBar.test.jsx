// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";
import { TopBar } from "../../src/renderer/components/TopBar.jsx";
import { paletteOpen, openPalette, closePalette } from "../../src/renderer/command-palette-store.js";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    detectResultsExport: vi.fn(async () => ({ ok: true })),
    openUrl: vi.fn(),
    runCheck: vi.fn(),
  },
}));

beforeEach(() => {
  cleanup();
  closePalette();
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
});