// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/preact";
import { GithubProjectCard } from "../../src/renderer/github/GithubProjectCard.tsx";

const project = {
  id: "facebook/react",
  name: "facebook/react",
  description: "用于构建用户界面的 JavaScript 库",
  url: "https://github.com/facebook/react",
  homepage: "https://react.dev",
  language: "JavaScript",
  stars: 241000,
  license: "MIT",
  topics: ["ui", "library", "frontend", "components"],
  aiParse: {
    summary: "构建用户界面的基础库",
    tags: ["react", "frontend"],
  },
  latestVersion: "19.1.1",
  lastSeenVersion: "19.0.0",
  addedAt: Date.now(),
  pinned: true,
};

afterEach(cleanup);

describe("GithubProjectCard", () => {
  it("shows project identity, metadata, summary, and update state", () => {
    const { getByRole, getByText } = render(
      <GithubProjectCard project={project} onView={vi.fn()} />,
    );

    expect(getByText("facebook/react")).toBeTruthy();
    expect(getByText("JavaScript")).toBeTruthy();
    expect(getByText("MIT")).toBeTruthy();
    expect(getByText("构建用户界面的基础库")).toBeTruthy();
    expect(getByText(/新版本 v19.1.1/)).toBeTruthy();
    expect(getByRole("button", { name: "更多操作" })).toBeTruthy();
    expect(getByText("+2")).toBeTruthy();
  });

  it("opens the reading panel from the project name and keeps external link separate", () => {
    const onView = vi.fn();
    const { getByRole, getByText } = render(
      <GithubProjectCard project={project} onView={onView} />,
    );

    fireEvent.click(getByRole("button", { name: "facebook/react" }));
    expect(onView).toHaveBeenCalledWith("facebook/react");
    expect(getByRole("link", { name: "react.dev" })).toBeTruthy();
    expect(getByRole("link", { name: "react.dev" }).getAttribute("href")).toBe("https://react.dev");
    expect(getByText("已置顶")).toBeTruthy();
  });

  it("exposes low-frequency actions through an accessible menu", () => {
    const onParse = vi.fn();
    const onRemove = vi.fn();
    const onTogglePin = vi.fn();
    const { getByRole } = render(
      <GithubProjectCard
        project={project}
        onView={vi.fn()}
        onParse={onParse}
        onRemove={onRemove}
        onTogglePin={onTogglePin}
      />,
    );

    fireEvent.click(getByRole("button", { name: "更多操作" }));
    expect(getByRole("menu")).toBeTruthy();
    fireEvent.click(getByRole("menuitem", { name: "查看解析" }));
    expect(onParse).toHaveBeenCalledWith("facebook/react");
  });
});
