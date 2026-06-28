// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/preact";
import { resetCheck, applyProgress } from "../../src/renderer/store.js";
import { api } from "../../src/renderer/api.js";
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

describe("AppRow 行级收编 (Task 10) + changelog ⓘ 入口", () => {
  beforeEach(() => {
    resetCheck();
    primeConfigCache({
      apps: [{ name: "vscode", bundle: "Visual Studio Code.app", download_url: "" }],
    });
  });
  afterEach(() => cleanup());

  it("行级按钮: 升级按钮存在; 退役的 row-overflow 触发器已移除", () => {
    applyProgress(makeResult({
      name: "vscode",
      bundle: "Visual Studio Code.app",
      brew_cask: "visual-studio-code",
      installed_version: "1.85",
      latest_version: "1.86",
      has_update: true,
      status: "update_available",
    }));
    render(<AppRow name="vscode" />);
    // 升级按钮在
    expect(screen.getByLabelText("升级 vscode")).toBeTruthy();
    // ··· 触发器已删除: Phase 32 后它只剩空菜单 ("暂无可用操作"),
    // 用户反馈太占位, 干脆删掉. 等未来真有行级动作再加回来.
    expect(screen.queryByLabelText("vscode 行的更多操作")).toBeFalsy();
    expect(document.querySelector(".row-overflow-trigger")).toBeFalsy();
  });

  // 回归守护: changelog ⓘ icon 在 AppInfo (跟 app name 同行), 点击弹 ChangelogPanel.
  // 之前 Phase 32 删除 ChangelogPanel 时一并丢了 ⓘ, 用户反馈 "changelog icon 怎么没了".
  it("有 changelog → AppInfo 显示 ⓘ info button", () => {
    applyProgress(makeResult({
      name: "vscode",
      bundle: "Visual Studio Code.app",
      installed_version: "1.85",
      latest_version: "1.86",
      has_update: true,
      status: "update_available",
      changelog: "### v1.86\n\n- feature A\n- fix B\n",
      changelog_url: "https://example.com/changelog",
    }));
    render(<AppRow name="vscode" />);
    const btn = screen.getByLabelText("查看更新说明");
    expect(btn).toBeTruthy();
    expect(btn.classList.contains("app-info-btn")).toBe(true);
  });

  it("无 changelog → ⓘ 不显示", () => {
    applyProgress(makeResult({
      name: "vscode",
      bundle: "Visual Studio Code.app",
      installed_version: "1.85",
      latest_version: "1.86",
      has_update: true,
      status: "update_available",
    }));
    render(<AppRow name="vscode" />);
    expect(screen.queryByLabelText("查看更新说明")).toBeFalsy();
  });

  it("点击 ⓘ → 弹 ChangelogPanel", () => {
    const md = "### v1.86\n\n- feature A\n- fix B\n";
    applyProgress(makeResult({
      name: "vscode",
      bundle: "Visual Studio Code.app",
      installed_version: "1.85",
      latest_version: "1.86",
      has_update: true,
      status: "update_available",
      changelog: md,
      changelog_url: "https://example.com/changelog",
    }));
    render(<AppRow name="vscode" />);
    fireEvent.click(screen.getByLabelText("查看更新说明"));
    // ChangelogPanel 渲染 (HEAD 的实现可能用 panel class, 这里断言 content 出现)
    const panel = document.querySelector(".changelog-panel");
    expect(panel).toBeTruthy();
    // markdown body 文字出现
    expect(panel.textContent).toContain("v1.86");
    expect(panel.textContent).toContain("feature A");
  });

  // 守护: 行级点击不该再触发跳转到 download_url (用户反馈 "取消每个应用点击后跳转").
  // 行级跳转会让用户误触, 真正的下载入口是 "升级" 按钮.
  it("点击行空白处 → 不调用 api.openUrl (不再跳转到 download_url)", () => {
    applyProgress(makeResult({
      name: "vscode",
      bundle: "Visual Studio Code.app",
      installed_version: "1.85",
      latest_version: "1.86",
      has_update: true,
      status: "update_available",
    }));
    primeConfigCache({
      apps: [{
        name: "vscode",
        bundle: "Visual Studio Code.app",
        download_url: "https://example.com/installer.dmg",
      }],
    });
    const spy = vi.spyOn(api, "openUrl").mockImplementation(() => Promise.resolve());
    const { container } = render(<AppRow name="vscode" />);
    // 点行根节点 (空白区, 不在升级按钮 / status badge / changelog panel)
    const row = container.querySelector(".app-row");
    fireEvent.click(row);
    expect(spy).not.toHaveBeenCalled();
    // 升级按钮仍然调用 brewUpgrade (不是 openUrl)
    fireEvent.click(screen.getByLabelText("升级 vscode"));
    // 我们不验证 brewUpgrade (那个走 IPC), 只确保 openUrl 没被行级 click 触发
    expect(spy).not.toHaveBeenCalledWith("https://example.com/installer.dmg");
  });
});