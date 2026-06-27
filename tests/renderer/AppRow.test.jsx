// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/preact";
import { resetCheck, applyProgress } from "../../src/renderer/store.js";
import { primeConfigCache, AppRow } from "../../src/renderer/components/AppRow.jsx";

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

describe("AppRow 行级收编 (Task 10)", () => {
  beforeEach(() => {
    resetCheck();
    primeConfigCache({
      apps: [{ name: "vscode", bundle: "Visual Studio Code.app", download_url: "" }],
    });
    applyProgress(makeResult({
      name: "vscode",
      bundle: "Visual Studio Code.app",
      brew_cask: "visual-studio-code",
      installed_version: "1.85",
      latest_version: "1.86",
      has_update: true,
      status: "update_available",
    }));
  });
  afterEach(() => cleanup());

  it("行内只有 upgrade + overflow menu 按钮, snooze/rollback/pin 不直接暴露", () => {
    render(<AppRow name="vscode" />);
    // 升级按钮 + ··· 触发器 (行级)
    expect(screen.getByLabelText("升级 vscode")).toBeTruthy();
    expect(screen.getByLabelText("vscode 行的更多操作")).toBeTruthy();
    // 原 row-level snooze/rollback/pin 按钮不在行级
    expect(screen.queryByLabelText("等下次再升")).toBeFalsy();
    expect(screen.queryByLabelText("查看回滚历史")).toBeFalsy();
    expect(screen.queryByLabelText("加入关注列表")).toBeFalsy();
  });
});