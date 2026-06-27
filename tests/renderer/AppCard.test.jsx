// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/preact";
import { resetCheck, applyProgress } from "../../src/renderer/store.js";
import { AppCard } from "../../src/renderer/components/AppCard.jsx";

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
});