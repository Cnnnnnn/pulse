/**
 * GitHub Release 检查模块。
 *
 * Seam：项目库 façade 只提供项目读取/更新、Token、持久化和请求 adapter；
 * Release 失败分类、版本种子和批量统计集中在这里，避免 GithubPage、scheduler
 * 和 store 各自理解同一套失败语义。
 */

export interface GithubReleaseProject {
  id: string;
  owner: string;
  repo: string;
  name?: string;
  latestVersion?: string;
  lastSeenVersion?: string;
  [key: string]: any;
}

export interface GithubReleaseResult {
  ok: boolean;
  reason?: string;
  retryAfter?: number;
  rateLimitRemaining?: number;
  permanent?: boolean;
  detail?: string;
}

export interface GithubCheckSummary {
  ok: true;
  newCount: number;
  errorCount: number;
  skippedCount: number;
  failedProjects: Array<Record<string, unknown>>;
  skippedProjects: Array<Record<string, unknown>>;
}

export interface GithubReleaseCheckerDeps {
  getProjects(): GithubReleaseProject[];
  updateProjects(_updater: (_projects: GithubReleaseProject[]) => GithubReleaseProject[]): void;
  getToken(): string;
  fetchRelease(_url: string, _token: string): Promise<any>;
  persist(): void;
  setBusyId(_id: string | null): void;
  hasUpdate(_project: GithubReleaseProject): boolean;
}

export function createGithubReleaseChecker(deps: GithubReleaseCheckerDeps) {
  async function fetchProjectRelease(
    id: string,
    opts: { silent?: boolean } = {},
  ): Promise<GithubReleaseResult> {
    const silent = !!opts.silent;
    const project = deps.getProjects().find((item) => item.id === id);
    if (!project) return { ok: false, reason: "not_found" };
    if (!silent) deps.setBusyId(id);
    try {
      const response = await deps.fetchRelease(
        `https://github.com/${project.owner}/${project.repo}`,
        deps.getToken(),
      );
      if (response.ok !== true) {
        return {
          ok: false,
          reason: response.reason || "fetch_failed",
          retryAfter: response.retryAfter,
          rateLimitRemaining: response.rateLimitRemaining,
          permanent: !!response.permanent,
          detail: response.error ? String(response.error) : response.detail || "",
        };
      }
      const release = response.release;
      const releases = Array.isArray(response.releases) ? response.releases : [];
      deps.updateProjects((projects) =>
        projects.map((item) =>
          item.id === id
            ? {
                ...item,
                latestVersion: release?.version || item.latestVersion || "",
                latestVersionPublishedAt: release?.publishedAt || 0,
                releases,
                releaseFetchedAt: Date.now(),
                lastSeenVersion:
                  item.lastSeenVersion === "" || item.lastSeenVersion == null
                    ? release?.version || item.latestVersion || ""
                    : item.lastSeenVersion,
              }
            : item,
        ),
      );
      deps.persist();
      return { ok: true };
    } catch (err: any) {
      return {
        ok: false,
        reason: "fetch_failed",
        detail: err && (err.message || err.toString()),
      };
    } finally {
      if (!silent) deps.setBusyId(null);
    }
  }

  async function checkProjects(
    projects: GithubReleaseProject[],
    onProgress?: (_done: number, _total: number) => void,
  ): Promise<GithubCheckSummary> {
    if (projects.length === 0) {
      return {
        ok: true,
        newCount: 0,
        errorCount: 0,
        skippedCount: 0,
        failedProjects: [],
        skippedProjects: [],
      };
    }
    let newCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const failedProjects: Array<Record<string, unknown>> = [];
    const skippedProjects: Array<Record<string, unknown>> = [];
    for (let i = 0; i < projects.length; i += 1) {
      const project = projects[i];
      if (onProgress) onProgress(i + 1, projects.length);
      const result = await fetchProjectRelease(project.id, { silent: true });
      if (!result.ok) {
        if (result.permanent) {
          skippedCount += 1;
          skippedProjects.push({
            id: project.id,
            name: project.name || project.id,
            reason: result.reason || "not_found",
          });
        } else {
          errorCount += 1;
          failedProjects.push({
            id: project.id,
            name: project.name || project.id,
            reason: result.reason || "fetch_failed",
            detail: result.detail || "",
            retryAfter: result.retryAfter,
            rateLimitRemaining: result.rateLimitRemaining,
          });
        }
        continue;
      }
      const updated = deps.getProjects().find((item) => item.id === project.id);
      if (updated && deps.hasUpdate(updated)) newCount += 1;
    }
    return {
      ok: true,
      newCount,
      errorCount,
      skippedCount,
      failedProjects,
      skippedProjects,
    };
  }

  return { fetchProjectRelease, checkProjects };
}
