// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/preact";
import { CommandPalette } from "../../src/renderer/components/CommandPalette.jsx";
import { paletteOpen, openPalette, closePalette, setPaletteSelectedIndex, setPaletteQuery } from "../../src/renderer/store/command-palette-store.js";

// vi.mock 会被 hoist, 用 vi.hoisted 让 mock fn 也能被测试代码引用
const { mockVersionsRunCheck } = vi.hoisted(() => ({
  mockVersionsRunCheck: vi.fn(async () => ({ started: true })),
}));

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    versionsCommandSearch: vi.fn(async (q) => ({
      ok: true,
      results: [
        { id: "app-vscode", label: "VS Code", kind: "app" },
        { id: "action-check", label: "检查更新", kind: "action" },
      ],
    })),
    versionsRunCheck: mockVersionsRunCheck,
  },
}));

beforeEach(() => {
  cleanup();
  closePalette();
  setPaletteSelectedIndex(0);
  mockVersionsRunCheck.mockClear();
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

describe("CommandPalette 检查更新 (断链修复)", () => {
  it("选中 action-check 调用 api.versionsRunCheck (而非不存在的 runCheck)", async () => {
    act(() => {
      paletteOpen.value = true;
      setPaletteQuery("检查");
    });
    const { container } = render(<CommandPalette />);

    // 等 command-search 返回 (250ms debounce)
    await waitFor(() => {
      expect(container.textContent).toContain("检查更新");
    }, { timeout: 2000 });

    // 点选 action-check 结果项
    const items = container.querySelectorAll('li[role="option"]');
    const checkItem = Array.from(items).find((li) => li.textContent.includes("检查更新"));
    expect(checkItem).toBeTruthy();
    fireEvent.click(checkItem);

    await waitFor(() => expect(mockVersionsRunCheck).toHaveBeenCalledTimes(1));
  });
});
