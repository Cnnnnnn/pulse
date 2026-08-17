export type GithubLibrarySort =
  | "added"
  | "stars"
  | "name"
  | "published"
  | "checked";

export type GithubLibraryStatus =
  | "all"
  | "recent"
  | "unread"
  | "unparsed"
  | "unchecked";

export interface GithubLibraryFilters {
  query?: string;
  language?: string;
  topic?: string;
  status?: GithubLibraryStatus;
  sort?: GithubLibrarySort;
}

function textOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function projectTopics(project: any): string[] {
  const topics = Array.isArray(project?.topics) ? project.topics : [];
  const aiTags = Array.isArray(project?.aiParse?.tags) ? project.aiParse.tags : [];
  return [...new Set(
    [...topics, ...aiTags]
      .filter((topic) => typeof topic === "string")
      .map((topic) => topic.trim())
      .filter(Boolean),
  )];
}

export function collectGithubTags(projects: any[]): string[] {
  if (!Array.isArray(projects)) return [];
  return [...new Set(projects.flatMap(projectTopics))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function getGithubProjectStatus(project: any) {
  if (project?.latestVersion && project.latestVersion !== project.lastSeenVersion) {
    return "update" as const;
  }
  if (!project?.aiParse) return "unparsed" as const;
  if (!project?.releaseFetchedAt) return "unchecked" as const;
  return "latest" as const;
}

function matchesQuery(project: any, query: string) {
  if (!query) return true;
  const searchText = [
    project?.id,
    project?.name,
    project?.description,
    project?.aiParse?.summary,
  ]
    .map(textOf)
    .join(" ")
    .toLowerCase();
  return searchText.includes(query);
}

function compareProjects(a: any, b: any, sort: GithubLibrarySort) {
  const pinnedDelta = Number(Boolean(b?.pinned)) - Number(Boolean(a?.pinned));
  if (pinnedDelta !== 0) return pinnedDelta;
  if (sort === "stars") return (b?.stars || 0) - (a?.stars || 0);
  if (sort === "name") return textOf(a?.name).localeCompare(textOf(b?.name));
  if (sort === "published") {
    return (b?.latestVersionPublishedAt || 0) - (a?.latestVersionPublishedAt || 0);
  }
  if (sort === "checked") {
    return (b?.releaseFetchedAt || 0) - (a?.releaseFetchedAt || 0);
  }
  return (b?.addedAt || 0) - (a?.addedAt || 0);
}

export function filterGithubProjects(
  projects: any[],
  filters: GithubLibraryFilters = {},
) {
  const query = textOf(filters.query).trim().toLowerCase();
  const language = textOf(filters.language);
  const topic = textOf(filters.topic);
  const status = filters.status || "all";
  const sort = filters.sort || "added";

  return (Array.isArray(projects) ? projects : [])
    .filter((project) => {
      if (!matchesQuery(project, query)) return false;
      if (language && project?.language !== language) return false;
      if (topic && !projectTopics(project).includes(topic)) return false;
      if (status === "unread" && getGithubProjectStatus(project) !== "update") {
        return false;
      }
      if (status === "recent" && !project?.lastViewedAt) return false;
      if (status === "unparsed" && project?.aiParse) return false;
      if (status === "unchecked" && project?.releaseFetchedAt) return false;
      return true;
    })
    .slice()
    .sort((a, b) => compareProjects(a, b, sort));
}

export function getGithubLibraryStats(projects: any[]) {
  const list = Array.isArray(projects) ? projects : [];
  return {
    total: list.length,
    unread: list.filter((project) => getGithubProjectStatus(project) === "update").length,
    parsed: list.filter((project) => Boolean(project?.aiParse)).length,
    unchecked: list.filter((project) => !project?.releaseFetchedAt).length,
    recent: list.filter((project) => Boolean(project?.lastViewedAt)).length,
    languages: [...new Set(
      list
        .map((project) => textOf(project?.language).trim())
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b)),
    tags: collectGithubTags(list),
  };
}
