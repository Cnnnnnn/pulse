// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  filterGithubProjects,
  getGithubLibraryStats,
  getGithubProjectStatus,
} from "../../src/renderer/github/github-library-selectors.ts";

const projects = [
  {
    id: "facebook/react",
    name: "facebook/react",
    description: "用于构建用户界面的 JavaScript 库",
    language: "TypeScript",
    stars: 241000,
    topics: ["ui", "library"],
    pinned: true,
    addedAt: 20,
    releaseFetchedAt: 200,
    latestVersionPublishedAt: 500,
    latestVersion: "19.1.1",
    lastSeenVersion: "19.0.0",
    aiParse: { summary: "构建用户界面", tags: ["frontend"] },
  },
  {
    id: "vercel/next.js",
    name: "vercel/next.js",
    description: "React framework for the web",
    language: "TypeScript",
    stars: 136000,
    topics: ["framework"],
    pinned: false,
    addedAt: 30,
    releaseFetchedAt: 300,
    latestVersionPublishedAt: 400,
    latestVersion: "15.4.6",
    lastSeenVersion: "15.4.6",
    aiParse: null,
  },
  {
    id: "shadcn-ui/ui",
    name: "shadcn-ui/ui",
    description: "Beautifully designed components",
    language: "TypeScript",
    stars: 98000,
    topics: [],
    pinned: false,
    addedAt: 10,
    releaseFetchedAt: 0,
    latestVersion: "",
    lastSeenVersion: "",
    aiParse: { summary: "组件集合", tags: ["ui", "components"] },
  },
];

describe("github library selectors", () => {
  it("combines query, language, topic, status, and sort without mutating input", () => {
    const result = filterGithubProjects(projects, {
      query: "react",
      language: "TypeScript",
      topic: "ui",
      status: "unread",
      sort: "stars",
    });

    expect(result.map((project) => project.id)).toEqual(["facebook/react"]);
    expect(projects[0].pinned).toBe(true);
    expect(projects).toHaveLength(3);
  });

  it("matches owner/repo, AI summary, and AI tags", () => {
    expect(filterGithubProjects(projects, { query: "shadcn" })).toHaveLength(1);
    expect(filterGithubProjects(projects, { query: "构建用户界面" })).toHaveLength(1);
    expect(filterGithubProjects(projects, { topic: "components" })).toHaveLength(1);
  });

  it("keeps pinned projects first for every sort", () => {
    const result = filterGithubProjects(projects, { sort: "name" });
    expect(result[0].id).toBe("facebook/react");
  });

  it("derives library counts and filter collections", () => {
    expect(getGithubLibraryStats(projects)).toMatchObject({
      total: 3,
      unread: 1,
      parsed: 2,
      unchecked: 1,
      languages: ["TypeScript"],
    });
    expect(getGithubLibraryStats(projects).tags).toEqual(
      ["components", "frontend", "framework", "library", "ui"].sort((a, b) =>
        a.localeCompare(b),
      ),
    );
  });

  it("classifies project status from the existing record shape", () => {
    expect(getGithubProjectStatus(projects[0])).toBe("update");
    expect(getGithubProjectStatus({
      ...projects[1],
      aiParse: { summary: "framework" },
    })).toBe("latest");
    expect(getGithubProjectStatus(projects[2])).toBe("unchecked");
    expect(getGithubProjectStatus({
      id: "x",
      latestVersion: "1.0.0",
      lastSeenVersion: "1.0.0",
      aiParse: null,
    })).toBe("unparsed");
  });
});
