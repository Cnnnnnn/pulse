// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { GithubDrawerShell } from "../../src/renderer/github/GithubDrawerShell.tsx";
import { IconBook, IconSparkles, IconTag } from "../../src/renderer/components/icons.tsx";

afterEach(cleanup);

const project = {
  name: "oraios/serena",
  description: "A powerful MCP toolkit for coding",
  language: "Python",
  stars: 28000,
  license: "MIT",
  homepage: "https://oraios.github.io/serena",
};

const tabs = [
  { key: "overview", label: "概览", icon: IconSparkles },
  { key: "readme", label: "README", icon: IconBook },
  { key: "ai", label: "AI 解析", icon: IconSparkles },
  { key: "update", label: "版本更新", icon: IconTag },
];

describe("GithubDrawerShell", () => {
  it("separates identity, tab navigation, and scroll content", () => {
    const { container, getByRole } = render(
      <GithubDrawerShell
        project={project}
        tabs={tabs}
        activeTab="overview"
        onTabChange={vi.fn()}
        onRefresh={vi.fn()}
        onOpenExternal={vi.fn()}
        onClose={vi.fn()}
        busy={false}
      >
        <div data-testid="panel-content">内容</div>
      </GithubDrawerShell>,
    );

    expect(container.querySelector(".github-drawer__topbar")).toBeTruthy();
    expect(container.querySelector(".github-drawer__tabs")).toBeTruthy();
    expect(container.querySelector(".github-drawer__content")).toBeTruthy();
    expect(container.querySelector(".github-drawer__body")).toBeTruthy();
    expect(container.querySelector(".github-drawer__topbar")?.textContent).not.toContain(project.description);
    expect(getByRole("tab", { name: "版本更新" })).toBeTruthy();
  });

  it("routes tab clicks through the shell boundary", () => {
    const onTabChange = vi.fn();
    const { getByRole } = render(
      <GithubDrawerShell
        project={project}
        tabs={tabs}
        activeTab="overview"
        onTabChange={onTabChange}
        onRefresh={vi.fn()}
        onOpenExternal={vi.fn()}
        onClose={vi.fn()}
        busy={false}
      >
        <div>内容</div>
      </GithubDrawerShell>,
    );

    fireEvent.click(getByRole("tab", { name: "README" }));
    expect(onTabChange).toHaveBeenCalledWith("readme");
  });
});
