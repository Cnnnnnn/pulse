// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { GithubProjectPanel } from "../../src/renderer/github/GithubProjectPanel.tsx";
import { githubProjects } from "../../src/renderer/store/github-projects-store.ts";

afterEach(cleanup);

const project = {
  id: "facebook/react",
  name: "facebook/react",
  description: "用于构建用户界面的 JavaScript 库",
  url: "https://github.com/facebook/react",
  homepage: "https://react.dev",
  language: "JavaScript",
  stars: 241000,
  license: "MIT",
  topics: ["ui", "library"],
  readme: "# React\n\nA library for user interfaces.",
  aiParse: { summary: "构建用户界面", usage: "npm install react", tags: ["frontend"] },
  latestVersion: "19.1.1",
  lastSeenVersion: "19.0.0",
  latestVersionPublishedAt: Date.now(),
  releases: [],
  releaseFetchedAt: Date.now(),
  addedAt: Date.now(),
};

beforeEach(() => {
  githubProjects.value = [project];
});

describe("GithubProjectPanel", () => {
  it("opens with overview and exposes README, AI, and update tabs", () => {
    const { container, getByRole, getByText, getAllByText } = render(
      <GithubProjectPanel projectId="facebook/react" onClose={vi.fn()} />,
    );

    expect(container.querySelector(".github-drawer__header--stacked")).toBeTruthy();
    expect(getAllByText("facebook/react").length).toBeGreaterThan(0);
    expect(getByRole("tab", { name: "概览" })).toBeTruthy();
    expect(getByRole("tab", { name: "README" })).toBeTruthy();
    expect(getByRole("tab", { name: "AI 解析" })).toBeTruthy();
    expect(getByRole("tab", { name: "版本更新" })).toBeTruthy();
    expect(container.querySelector('[data-tab="overview"]')).toBeTruthy();
    expect(getByText("构建用户界面")).toBeTruthy();
  });

  it("switches to README and AI content without losing the project header", () => {
    const { container, getByRole, getByText } = render(
      <GithubProjectPanel projectId="facebook/react" onClose={vi.fn()} />,
    );

    fireEvent.click(getByRole("tab", { name: "README" }));
    expect(container.querySelector('[data-tab="readme"]')).toBeTruthy();
    expect(getByText("React")).toBeTruthy();
    fireEvent.click(getByRole("tab", { name: "AI 解析" }));
    expect(container.querySelector('[data-tab="ai"]')).toBeTruthy();
    expect(getByText("使用方法")).toBeTruthy();
    expect(getByText("facebook/react")).toBeTruthy();
  });

  it("honors initial update tab and close action", () => {
    const onClose = vi.fn();
    const { container, getByRole, getByText } = render(
      <GithubProjectPanel projectId="facebook/react" initialTab="update" onClose={onClose} />,
    );

    expect(getByRole("tab", { name: "版本更新" }).getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[data-tab="update"]')).toBeTruthy();
    expect(getByText("该项目还没有发布 Release")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
