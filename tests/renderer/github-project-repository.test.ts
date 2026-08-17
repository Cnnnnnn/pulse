// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import { createGithubProjectRepository } from "../../src/renderer/github/github-project-repository.ts";

describe("github-project-repository", () => {
  beforeEach(() => {
    localStorage.removeItem("pulse.github.projects.v1");
  });

  it("通过小接口保存并读取项目集合", () => {
    const repository = createGithubProjectRepository();
    const projects = [{ id: "owner/repo", name: "Repo" }];
    expect(repository.save(projects)).toBe(true);
    expect(repository.load()).toEqual(projects);
  });

  it("损坏的持久化内容安全回退为空数组", () => {
    localStorage.setItem("pulse.github.projects.v1", "not-json");
    const repository = createGithubProjectRepository();
    expect(repository.load()).toEqual([]);
  });
});
