import { describe, expect, it, vi } from "vitest";
import { createGithubBackupService } from "../../src/renderer/github/github-backup-service.ts";

function makeService(projects = [{ id: "owner/local" }], token = "") {
  let current = projects;
  let density: "comfortable" | "compact" = "comfortable";
  let currentToken = token;
  const persist = vi.fn();
  const service = createGithubBackupService({
    getProjects: () => current,
    mergeProjects: (incoming) => {
      const existing = new Set(current.map((project) => project.id));
      const added = incoming.filter((project) => project && !existing.has(project.id));
      current = [...added, ...current];
      return { imported: added.length, skipped: incoming.length - added.length };
    },
    getDensity: () => density,
    setDensity: (value) => { density = value; },
    getToken: () => currentToken,
    setToken: (value) => { currentToken = value; },
    persist,
  });
  return { service, getProjects: () => current, getDensity: () => density, getToken: () => currentToken, persist };
}

describe("github-backup-service", () => {
  it("导出包含 schema、项目和设置", () => {
    const h = makeService();
    const payload = JSON.parse(h.service.exportData());
    expect(payload.schema).toBe("pulse.github.export.v1");
    expect(payload.projects).toEqual([{ id: "owner/local" }]);
    expect(payload.settings).toMatchObject({ density: "comfortable", token: "" });
  });

  it("导入按 id 去重并保留本地非空 Token", () => {
    const h = makeService([{ id: "owner/local" }], "local-token");
    const result = h.service.importData(JSON.stringify({
      schema: "pulse.github.export.v1",
      projects: [{ id: "owner/local" }, { id: "owner/new" }],
      settings: { density: "compact", token: "imported-token" },
    }));
    expect(result).toEqual({ ok: true, imported: 1, skipped: 1 });
    expect(h.getProjects()).toEqual([{ id: "owner/new" }, { id: "owner/local" }]);
    expect(h.getDensity()).toBe("compact");
    expect(h.getToken()).toBe("local-token");
    expect(h.persist).toHaveBeenCalledTimes(1);
  });
});
