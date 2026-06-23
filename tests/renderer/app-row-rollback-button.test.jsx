// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";
import { resetCheck, applyProgress } from "../../src/renderer/store.js";
import { primeConfigCache, AppRow } from "../../src/renderer/components/AppRow.jsx";
import {
  openVersionHistory,
  versionHistoryApp,
  versionHistoryOpen,
} from "../../src/renderer/store-version-history.js";

function makeResult(over) {
  return {
    name: "X",
    bundle: "x.app",
    brew_cask: "",
    installed_version: "1.0",
    latest_version: "2.0",
    has_update: true,
    status: "outdated",
    source: "brew_formulae",
    note: "",
    ...over,
  };
}

describe("AppRow rollback button (Phase C3)", () => {
  beforeEach(() => {
    resetCheck();
    primeConfigCache({
      apps: [{ name: "Cursor", bundle: "Cursor.app", download_url: "" }],
    });
    applyProgress({
      name: "Cursor",
      bundle: "Cursor.app",
      brew_cask: "cursor",
      installed_version: "1.0",
      latest_version: "2.0",
      has_update: true,
      status: "outdated",
      source: "brew_formulae",
    });
    // 清空 store
    versionHistoryOpen.value = false;
    versionHistoryApp.value = null;
  });
  afterEach(() => {
    cleanup();
    versionHistoryOpen.value = false;
    versionHistoryApp.value = null;
  });

  it("显示 ⏪ 按钮 + 点击 → openVersionHistory(Cursor)", () => {
    const { container } = render(<AppRow name="Cursor" />);
    const btn = container.querySelector(".row-action-rollback");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(versionHistoryOpen.value).toBe(true);
    expect(versionHistoryApp.value).toBe("Cursor");
  });

  it("无 result 的 row (detecting / pending) 仍渲染按钮, 点了不爆", () => {
    // resetCheck 后, 没有任何 result
    applyProgress({ name: "Cursor", status: "detecting" }); // phase-only
    // 这里 result 还是空; 走 pending 分支
    const { container } = render(<AppRow name="Cursor" />);
    const btn = container.querySelector(".row-action-rollback");
    expect(btn).toBeTruthy();
    // click 不会因为没 result 爆
    fireEvent.click(btn);
    expect(versionHistoryApp.value).toBe("Cursor");
  });
});