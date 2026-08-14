// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/preact";
import { resetCheck, applyProgress } from "../../src/renderer/store.ts";
import { AppCard } from "../../src/renderer/components/AppCard.tsx";
import { api } from "../../src/renderer/api.ts";

vi.mock("../../src/renderer/api.ts", () => ({
  api: {
    brewUpgrade: vi.fn(() => Promise.resolve({ success: true })),
    getAppIcon: vi.fn(() => Promise.resolve(null)),
  },
}));

function makeResult(over) {
  return {
    name: "X",
    bundle: "x.app",
    brew_cask: "x",
    installed_version: "1.0",
    latest_version: "2.0",
    has_update: true,
    status: "update_available",
    source: "brew_formulae",
    note: "",
    ...over,
  };
}

describe("AppCard (Task 11)", () => {
  beforeEach(() => {
    resetCheck();
    applyProgress(makeResult({
      name: "vscode",
      bundle: "Visual Studio Code.app",
      brew_cask: "visual-studio-code",
      installed_version: "1.85",
      latest_version: "1.86",
      has_update: true,
    }));
  });
  afterEach(() => cleanup());

  it("渲染 avatar + name + 升级按钮", () => {
    render(<AppCard name="vscode" />);
    expect(screen.getByText("vscode")).toBeTruthy();
    expect(screen.getByLabelText("升级 vscode")).toBeTruthy();
  });

  it("显示 installed_version 并使用 brew_cask 执行升级", async () => {
    render(<AppCard name="vscode" />);

    expect(screen.getByText(/1\.85.*1\.86/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("升级 vscode"));

    await waitFor(() => {
      expect(api.brewUpgrade).toHaveBeenCalledWith("visual-studio-code");
    });
  });
});
