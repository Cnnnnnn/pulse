// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { GithubLibraryHeader } from "../../src/renderer/github/GithubLibraryHeader.tsx";
import { GithubLibrarySidebar } from "../../src/renderer/github/GithubLibrarySidebar.tsx";
import { GithubProjectCard } from "../../src/renderer/github/GithubProjectCard.tsx";
import { GithubProjectGrid } from "../../src/renderer/github/GithubProjectGrid.tsx";

afterEach(cleanup);

const stats = {
  total: 9,
  unread: 2,
  parsed: 5,
  unchecked: 2,
  recent: 3,
  languages: ["TypeScript"],
  tags: ["frontend"],
};

const project = {
  id: "facebook/react",
  name: "facebook/react",
  description: "用于构建用户界面的 JavaScript 库",
  language: "TypeScript",
  topics: ["frontend"],
  aiParse: null,
};

describe("GitHub controls visual contract", () => {
  it("uses the shared control class across page actions", () => {
    const { container, getByRole, getAllByRole } = render(
      <>
        <GithubLibraryHeader
          stats={stats}
          checking={false}
          progress={{ done: 0, total: 0 }}
          onAdd={() => {}}
          onCheckUpdates={() => {}}
          onMarkAllSeen={() => {}}
          onRetryFailed={() => {}}
        />
        <GithubLibrarySidebar
          stats={stats}
          filters={{ status: "all", language: "", topic: "" }}
          onFiltersChange={() => {}}
        />
        <GithubProjectCard project={project} />
        <GithubProjectGrid projects={Array.from({ length: 9 }, (_, i) => ({ ...project, id: `o/${i}`, name: `o/${i}` }))} />
      </>,
    );

    expect(getByRole("button", { name: "添加项目" }).className).toContain("github-control");
    expect(getByRole("button", { name: /全部项目/ }).className).toContain("github-control");
    expect(getAllByRole("button", { name: "更多操作" })[0].className).toContain("github-control");
    expect(getByRole("button", { name: "下一页" }).className).toContain("github-control");
    expect(container.querySelectorAll(".github-control").length).toBeGreaterThan(6);
  });
});
