// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";
import { CommandPalette } from "../../src/renderer/components/CommandPalette.jsx";
import { paletteOpen, openPalette, closePalette, setPaletteSelectedIndex } from "../../src/renderer/command-palette-store.js";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    versionsCommandSearch: vi.fn(async (q) => ({
      ok: true,
      results: [
        { id: "app-vscode", label: "VS Code", kind: "app" },
        { id: "action-check", label: "检查更新", kind: "action" },
      ],
    })),
    runCheck: vi.fn(async () => ({ ok: true })),
  },
}));

beforeEach(() => {
  cleanup();
  closePalette();
  setPaletteSelectedIndex(0);
});

describe("CommandPalette", () => {
  it("关闭时渲染空", () => {
    const { container } = render(<CommandPalette />);
    expect(container.querySelector(".command-palette")).toBeFalsy();
  });
  it("打开时渲染 input", async () => {
    openPalette();
    render(<CommandPalette />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("combobox")).toBeTruthy();
  });
  it("Esc 关闭", async () => {
    openPalette();
    render(<CommandPalette />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(paletteOpen.value).toBe(false);
  });
});
