// @vitest-environment happy-dom
/**
 * tests/renderer/github-projects-store.test.js
 *
 * 覆盖 Release 更新追踪的两项扩展：
 *  - markGithubAllSeen 批量标记已读（仅标记有更新的项，返回计数）
 *  - 视图密度偏好（githubDensity / setGithubDensity / loadGithubSettings）持久化
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  githubProjects,
  githubDensity,
  githubToken,
  markGithubAllSeen,
  setGithubDensity,
  setGithubToken,
  loadGithubSettings,
} from "../../src/renderer/store/github-projects-store.js";

function seed(items) {
  githubProjects.value = items.map((x) => ({
    id: x.id,
    name: x.id,
    latestVersion: x.latestVersion || "",
    lastSeenVersion: x.lastSeenVersion || "",
    releases: x.releases || [],
    releaseFetchedAt: x.releaseFetchedAt || 0,
  }));
}

describe("github store · 批量已读 + 视图密度", () => {
  beforeEach(() => {
    githubProjects.value = [];
    githubDensity.value = "comfortable";
    githubToken.value = "";
    try {
      globalThis.localStorage.clear();
    } catch {
      /* happy-dom 无 localStorage 时忽略 */
    }
  });

  it("markGithubAllSeen 仅标记有更新的项目，返回计数", () => {
    seed([
      { id: "a/b", latestVersion: "2.0.0", lastSeenVersion: "1.0.0" },
      { id: "c/d", latestVersion: "1.0.0", lastSeenVersion: "1.0.0" },
      { id: "e/f", latestVersion: "", lastSeenVersion: "" },
    ]);
    const n = markGithubAllSeen();
    expect(n).toBe(1);
    const a = githubProjects.value.find((p) => p.id === "a/b");
    const c = githubProjects.value.find((p) => p.id === "c/d");
    expect(a.lastSeenVersion).toBe("2.0.0");
    expect(c.lastSeenVersion).toBe("1.0.0"); // 已最新项不变
  });

  it("markGithubAllSeen 无更新时返回 0 且不写回", () => {
    seed([{ id: "a/b", latestVersion: "1.0.0", lastSeenVersion: "1.0.0" }]);
    const n = markGithubAllSeen();
    expect(n).toBe(0);
    expect(githubProjects.value[0].lastSeenVersion).toBe("1.0.0");
  });

  it("setGithubDensity 写信号并持久化", () => {
    setGithubDensity("compact");
    expect(githubDensity.value).toBe("compact");
    const raw = globalThis.localStorage.getItem("pulse.github.settings.v1");
    expect(raw).toContain("compact");
  });

  it("loadGithubSettings 从持久化恢复密度", () => {
    setGithubDensity("compact");
    githubDensity.value = "comfortable";
    loadGithubSettings();
    expect(githubDensity.value).toBe("compact");
  });

  it("setGithubDensity 拒绝非法值", () => {
    setGithubDensity("compact");
    setGithubDensity("weird");
    expect(githubDensity.value).toBe("compact");
  });

  it("setGithubToken 写信号并持久化（token 不被提交到版本库）", () => {
    setGithubToken("github_pat_demo123");
    expect(githubToken.value).toBe("github_pat_demo123");
    const raw = globalThis.localStorage.getItem("pulse.github.settings.v1");
    expect(raw).toContain("github_pat_demo123");
    expect(raw).toContain("comfortable"); // 密度也一并保留
  });

  it("setGithubToken 去除首尾空白", () => {
    setGithubToken("  github_pat_x  ");
    expect(githubToken.value).toBe("github_pat_x");
  });

  it("loadGithubSettings 从持久化恢复 token", () => {
    setGithubToken("github_pat_restore");
    githubToken.value = "";
    loadGithubSettings();
    expect(githubToken.value).toBe("github_pat_restore");
  });

  it("setGithubDensity 不会清掉已保存的 token", () => {
    setGithubToken("github_pat_keep");
    setGithubDensity("compact");
    expect(githubToken.value).toBe("github_pat_keep");
    const raw = globalThis.localStorage.getItem("pulse.github.settings.v1");
    expect(raw).toContain("github_pat_keep");
    expect(raw).toContain("compact");
  });

  it("setGithubToken('') 清除令牌", () => {
    setGithubToken("github_pat_tmp");
    setGithubToken("");
    expect(githubToken.value).toBe("");
    const raw = globalThis.localStorage.getItem("pulse.github.settings.v1");
    expect(raw).not.toContain("github_pat_tmp");
  });
});
