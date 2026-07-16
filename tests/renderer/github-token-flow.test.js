// @vitest-environment happy-dom
/**
 * tests/renderer/github-token-flow.test.js
 *
 * 验证「检查更新」链路是否真的把 githubToken 透传给 api.githubFetchRelease。
 * 这是「我保存了 token 但检查更新还是报错」的根因判定测试。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "../../src/renderer/api.js";
import {
  githubProjects,
  githubToken,
  checkGithubUpdates,
} from "../../src/renderer/store/github-projects-store.js";

function seed(items) {
  githubProjects.value = items.map((x) => ({
    id: x.id,
    name: x.id,
    owner: x.id.split("/")[0],
    repo: x.id.split("/")[1],
    latestVersion: x.latestVersion || "",
    lastSeenVersion: x.lastSeenVersion || "",
    releases: x.releases || [],
    releaseFetchedAt: x.releaseFetchedAt || 0,
  }));
}

describe("github 检查更新 · token 透传", () => {
  let captured;
  beforeEach(() => {
    githubProjects.value = [];
    githubToken.value = "";
    captured = [];
    // 替换 api.githubFetchRelease，记录收到的 token
    api.githubFetchRelease = async (input, token) => {
      captured.push({ input, token });
      return { ok: true, release: { version: "9.9.9" }, releases: [] };
    };
  });

  it("signal 有 token 时，透传给 api.githubFetchRelease", async () => {
    seed([{ id: "a/b" }]);
    githubToken.value = "github_pat_flowtest";
    const r = await checkGithubUpdates();
    expect(r.ok).toBe(true);
    expect(captured.length).toBe(1);
    expect(captured[0].token).toBe("github_pat_flowtest");
  });

  it("signal 为空时，传空串（回退 .env）", async () => {
    seed([{ id: "c/d" }]);
    githubToken.value = "";
    await checkGithubUpdates();
    expect(captured.length).toBe(1);
    expect(captured[0].token).toBe("");
  });

  it("loadGithubSettings 未运行时，githubToken 默认空（复现『保存了但没生效』）", async () => {
    // 仅 seed 项目，不调用 loadGithubSettings，也不手动设 signal
    seed([{ id: "e/f" }]);
    githubToken.value = ""; // 模拟刚启动、GitHub 视图尚未挂载
    await checkGithubUpdates();
    expect(captured[0].token).toBe("");
  });
});
