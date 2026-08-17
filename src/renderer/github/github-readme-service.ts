/**
 * GitHub README / AI parse module。
 *
 * Interface: refreshReadme(id) 与 parseProjectAi(id, force)。项目状态、GitHub 请求、
 * AI 请求和持久化通过 adapter 注入，调用方不需要理解流程中的中间状态。
 */

import type { AiReadmeParsePayload } from "../../shared/ipc-contracts.ts";

export interface GithubReadmeProject {
  id: string;
  owner: string;
  repo: string;
  name?: string;
  description?: string;
  readme?: string;
  aiParse?: unknown;
  [key: string]: any;
}

export interface GithubReadmeServiceDeps {
  getProject(_id: string): GithubReadmeProject | undefined;
  updateProject(_id: string, _updater: (_project: GithubReadmeProject) => GithubReadmeProject): void;
  getToken(): string;
  fetchProject(_url: string, _token: string): Promise<any>;
  parseReadme(_input: AiReadmeParsePayload): Promise<any>;
  persist(): void;
  setBusyId(_id: string | null): void;
}

export function createGithubReadmeService(deps: GithubReadmeServiceDeps) {
  async function refreshReadme(id: string) {
    const project = deps.getProject(id);
    if (!project) return { ok: false, reason: "not_found" } as const;
    deps.setBusyId(id);
    try {
      const response = await deps.fetchProject(
        `https://github.com/${project.owner}/${project.repo}`,
        deps.getToken(),
      );
      if (response.ok !== true) {
        return { ok: false, reason: response.reason || "fetch_failed" } as const;
      }
      deps.updateProject(id, (current) => ({
        ...current,
        readme: response.readme || current.readme,
        readmeFetchedAt: response.readme ? Date.now() : current.readmeFetchedAt,
        description: response.meta?.description || current.description,
        stars: response.meta?.stars || current.stars,
        language: response.meta?.language || current.language,
        homepage: response.meta?.homepage || current.homepage,
      }));
      deps.persist();
      return { ok: true } as const;
    } finally {
      deps.setBusyId(null);
    }
  }

  async function parseProjectAi(id: string, force = false) {
    const project = deps.getProject(id);
    if (!project) return { ok: false, reason: "not_found" } as const;
    if (!force && project.aiParse) {
      return { ok: true, result: project.aiParse, cached: true } as const;
    }
    let readme = project.readme || "";
    if (!readme.trim()) {
      const refreshed = await refreshReadme(id);
      if (!refreshed.ok) return refreshed;
      readme = deps.getProject(id)?.readme || "";
    }
    if (!readme.trim()) return { ok: false, reason: "no_readme" } as const;

    deps.setBusyId(id);
    try {
      const response = await deps.parseReadme({
        projectName: project.name,
        description: project.description,
        readme,
      });
      if (response.ok !== true) {
        return { ok: false, reason: response.reason || "ai_failed" } as const;
      }
      deps.updateProject(id, (current) => ({
        ...current,
        aiParse: response.result,
        aiParsedAt: Date.now(),
      }));
      deps.persist();
      return { ok: true, result: response.result } as const;
    } finally {
      deps.setBusyId(null);
    }
  }

  return { refreshReadme, parseProjectAi };
}
