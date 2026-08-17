// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { GithubPage } from "../../src/renderer/github/GithubPage.tsx";
import { githubProjects } from "../../src/renderer/store/github-projects-store.ts";

afterEach(cleanup);

const project = {
  id: "facebook/react",
  name: "facebook/react",
  description: "用于构建用户界面的 JavaScript 库",
  url: "https://github.com/facebook/react",
  language: "JavaScript",
  stars: 241000,
  topics: ["ui", "frontend"],
  aiParse: { summary: "构建用户界面", tags: ["react"] },
  latestVersion: "19.1.1",
  lastSeenVersion: "19.0.0",
  latestVersionPublishedAt: Date.now(),
  releaseFetchedAt: Date.now(),
  releases: [],
  readme: "# React",
  addedAt: Date.now(),
};

beforeEach(() => {
  githubProjects.value = [project];
});

describe("GithubPage curated library integration", () => {
  it("connects header, search, sidebar, card grid, and reading panel", () => {
    const { container, getByRole, getByText, getAllByText } = render(<GithubPage />);

    expect(getByText("我的开源库")).toBeTruthy();
    expect(getByRole("button", { name: "添加项目" })).toBeTruthy();
    expect(getByRole("textbox", { name: "搜索收录项目" })).toBeTruthy();
    expect(container.querySelector(".github-project-grid")).toBeTruthy();
    expect(getAllByText("facebook/react").length).toBeGreaterThan(0);

    fireEvent.input(getByRole("textbox", { name: "搜索收录项目" }), {
      target: { value: "facebook" },
    });
    expect(container.querySelector(".github-project-grid")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "facebook/react" }));
    expect(getByRole("tab", { name: "概览" })).toBeTruthy();
  });

  it("opens the add dialog from the primary action", () => {
    const { getByRole } = render(<GithubPage />);
    fireEvent.click(getByRole("button", { name: "添加项目" }));
    expect(getByRole("dialog")).toBeTruthy();
    expect(getByRole("button", { name: "关闭" })).toBeTruthy();
  });
});
