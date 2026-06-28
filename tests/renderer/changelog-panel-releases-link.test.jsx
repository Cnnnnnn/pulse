// @vitest-environment happy-dom
/**
 * 守护 ChangelogPanel "查看发布页" 按钮 — hilo_changelog_manifest 的 releaseUrl
 * 是 zip 相对路径, 不能给用户当 release page 跳, 所以这种 source 不显示按钮.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { ChangelogPanel } from "../../src/renderer/components/ChangelogPanel.jsx";

describe("ChangelogPanel releases link 可见性 (2026-06-28)", () => {
  afterEach(() => cleanup());

  function makeResult(over) {
    return {
      name: "X",
      latest_version: "1.0",
      changelog: "### v1.0\n\n- change\n",
      changelog_url: "https://example.com/changelog.json",
      release_url: "MiniMax Hub-1.0-mac.zip", // zip 相对路径, 无效
      ...over,
    };
  }

  it("hilo_changelog_manifest → 不显示「查看发布页」按钮 (zip 相对路径不是 release page)", () => {
    const { container } = render(
      <ChangelogPanel result={makeResult({ source: "hilo_changelog_manifest" })} />
    );
    const btn = container.querySelector(".changelog-releases-btn");
    expect(btn).toBeFalsy();
  });

  it("github_release → 显示「GitHub Releases」按钮 (有完整 release page URL)", () => {
    const { container } = render(
      <ChangelogPanel result={makeResult({
        source: "github_release",
        release_url: "https://github.com/foo/bar/releases/tag/v1.0",
      })} />
    );
    const btn = container.querySelector(".changelog-releases-btn");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("GitHub Releases");
  });

  it("release_url 空 → 任何 source 都不显示按钮", () => {
    const { container } = render(
      <ChangelogPanel result={makeResult({
        source: "github_release",
        release_url: "",
      })} />
    );
    expect(container.querySelector(".changelog-releases-btn")).toBeFalsy();
  });
});