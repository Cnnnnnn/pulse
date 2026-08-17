import { describe, expect, it, vi } from "vitest";
import { createGithubReadmeService } from "../../src/renderer/github/github-readme-service.ts";

function makeHarness(project = { id: "owner/repo", owner: "owner", repo: "repo", name: "Repo", description: "old", readme: "" }) {
  let current = project;
  const persist = vi.fn();
  const setBusyId = vi.fn();
  const fetchProject = vi.fn(async () => ({
    ok: true,
    readme: "# README",
    meta: { description: "new", stars: 10, language: "TypeScript", homepage: "https://example.com" },
  }));
  const parseReadme = vi.fn(async () => ({ ok: true, result: { summary: "parsed" } }));
  const service = createGithubReadmeService({
    getProject: () => current,
    updateProject: (_id, updater) => { current = updater(current); },
    getToken: () => "token",
    fetchProject,
    parseReadme,
    persist,
    setBusyId,
  });
  return { service, getProject: () => current, fetchProject, parseReadme, persist, setBusyId };
}

describe("github-readme-service", () => {
  it("刷新 README 会合并元数据并持久化", async () => {
    const h = makeHarness();
    await expect(h.service.refreshReadme("owner/repo")).resolves.toEqual({ ok: true });
    expect(h.getProject()).toMatchObject({ readme: "# README", description: "new", stars: 10 });
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.setBusyId).toHaveBeenLastCalledWith(null);
  });

  it("已有 AI 结果时直接命中缓存", async () => {
    const h = makeHarness({
      id: "owner/repo",
      owner: "owner",
      repo: "repo",
      name: "Repo",
      description: "old",
      readme: "# README",
      aiParse: { summary: "cached" },
    });
    await expect(h.service.parseProjectAi("owner/repo")).resolves.toEqual({
      ok: true,
      result: { summary: "cached" },
      cached: true,
    });
    expect(h.parseReadme).not.toHaveBeenCalled();
  });

  it("解析 README 会写回 AI 结果", async () => {
    const h = makeHarness({
      id: "owner/repo",
      owner: "owner",
      repo: "repo",
      name: "Repo",
      description: "old",
      readme: "# README",
    });
    const result = await h.service.parseProjectAi("owner/repo", true);
    expect(result).toMatchObject({ ok: true, result: { summary: "parsed" } });
    expect(h.getProject().aiParse).toEqual({ summary: "parsed" });
    expect(h.persist).toHaveBeenCalledTimes(1);
  });
});
