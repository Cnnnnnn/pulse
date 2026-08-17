import { describe, expect, it, vi } from "vitest";
import { createGithubReleaseChecker } from "../../src/renderer/github/github-release-checker.ts";

function makeHarness(responseFor: (url: string) => unknown) {
  let projects = [
    { id: "owner/a", owner: "owner", repo: "a", name: "A", lastSeenVersion: "1.0.0" },
    { id: "owner/b", owner: "owner", repo: "b", name: "B", lastSeenVersion: "" },
  ];
  const persist = vi.fn();
  const setBusyId = vi.fn();
  const checker = createGithubReleaseChecker({
    getProjects: () => projects,
    updateProjects: (updater) => {
      projects = updater(projects);
    },
    getToken: () => "token",
    fetchRelease: vi.fn(async (url: string) => responseFor(url)),
    persist,
    setBusyId,
    hasUpdate: (project) => project.latestVersion !== project.lastSeenVersion,
  });
  return { checker, getProjects: () => projects, persist, setBusyId };
}

describe("github-release-checker", () => {
  it("成功拉取会更新 release、种子 lastSeen 并持久化", async () => {
    const harness = makeHarness(() => ({
      ok: true,
      release: { version: "2.0.0", publishedAt: 123 },
      releases: [{ version: "2.0.0" }],
    }));
    const result = await harness.checker.fetchProjectRelease("owner/b");
    expect(result).toEqual({ ok: true });
    expect(harness.getProjects()[1].latestVersion).toBe("2.0.0");
    expect(harness.getProjects()[1].lastSeenVersion).toBe("2.0.0");
    expect(harness.persist).toHaveBeenCalledTimes(1);
    expect(harness.setBusyId).toHaveBeenNthCalledWith(1, "owner/b");
    expect(harness.setBusyId).toHaveBeenLastCalledWith(null);
  });

  it("批量检查区分新版本、永久失败和瞬时失败", async () => {
    const harness = makeHarness((url) => {
      if (url.endsWith("/b")) {
        return { ok: false, reason: "not_found", permanent: true };
      }
      return { ok: false, reason: "rate_limited", retryAfter: 60 };
    });
    const result = await harness.checker.checkProjects(harness.getProjects());
    expect(result.newCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.skippedProjects[0]).toMatchObject({ id: "owner/b" });
    expect(result.failedProjects[0]).toMatchObject({
      id: "owner/a",
      reason: "rate_limited",
      retryAfter: 60,
    });
  });
});
