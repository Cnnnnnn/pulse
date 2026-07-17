// @vitest-environment happy-dom
/**
 * tests/renderer/github-import-export.test.js
 *
 * GitHub 数据导出/导入 —— 让收录库可备份可迁移。
 * 数据全在 renderer 的 localStorage，导出导入纯前端（Blob 下载 + file input 读取），
 * 不走主进程文件系统。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  githubProjects,
  githubDensity,
  githubToken,
  addGithubProject,
  exportGithubData,
  importGithubData,
} from "../../src/renderer/store/github-projects-store.js";
import { api } from "../../src/renderer/api.js";

beforeEach(() => {
  githubProjects.value = [];
  githubDensity.value = "comfortable";
  githubToken.value = "";
  try {
    globalThis.localStorage.clear();
  } catch {
    /* happy-dom 无 localStorage 时忽略 */
  }
});

/** 直接构造项目塞进 signal（绕过网络抓取）。 */
function injectProjects(items) {
  githubProjects.value = items.map((x) => ({
    id: x.id,
    owner: x.id.split("/")[0],
    repo: x.id.split("/")[1],
    name: x.name || x.id,
    description: x.description || "",
    language: x.language || "",
    stars: x.stars || 0,
    addedAt: x.addedAt || 1000,
    readme: x.readme || "",
    aiParse: null,
    latestVersion: "",
    lastSeenVersion: "",
    releases: [],
    releaseFetchedAt: 0,
    ...x,
  }));
}

describe("exportGithubData", () => {
  it("结构含 schema / exportedAt / projects / settings", () => {
    injectProjects([{ id: "a/b" }]);
    githubDensity.value = "compact";
    githubToken.value = "github_pat_x";
    const raw = exportGithubData();
    const o = JSON.parse(raw);
    expect(o.schema).toBe("pulse.github.export.v1");
    expect(typeof o.exportedAt).toBe("number");
    expect(o.exportedAt).toBeGreaterThan(0);
    expect(Array.isArray(o.projects)).toBe(true);
    expect(o.projects.length).toBe(1);
    expect(o.projects[0].id).toBe("a/b");
    expect(o.settings.density).toBe("compact");
    expect(o.settings.token).toBe("github_pat_x");
  });

  it("空库也能导出（projects 为空数组）", () => {
    const raw = exportGithubData();
    const o = JSON.parse(raw);
    expect(o.projects).toEqual([]);
  });
});

describe("importGithubData", () => {
  it("合法 JSON + 新 id → 导入成功，imported 计数正确", () => {
    const payload = JSON.stringify({
      schema: "pulse.github.export.v1",
      exportedAt: 1000,
      projects: [
        { id: "x/y", name: "x/y", owner: "x", repo: "y" },
        { id: "m/n", name: "m/n", owner: "m", repo: "n" },
      ],
      settings: { density: "compact", token: "" },
    });
    const r = importGithubData(payload);
    expect(r.ok).toBe(true);
    expect(r.imported).toBe(2);
    expect(r.skipped).toBe(0);
    expect(githubProjects.value.length).toBe(2);
    expect(githubProjects.value.some((p) => p.id === "x/y")).toBe(true);
    expect(githubProjects.value.some((p) => p.id === "m/n")).toBe(true);
    // density 采用导入值
    expect(githubDensity.value).toBe("compact");
  });

  it("已存在的 id → 跳过（保留本地），skipped 计数正确", () => {
    injectProjects([{ id: "a/exist", readme: "local kept" }]);
    const payload = JSON.stringify({
      schema: "pulse.github.export.v1",
      exportedAt: 1000,
      projects: [
        { id: "a/exist", readme: "IMPORT OVERWRITE" },
        { id: "b/new" },
      ],
      settings: { density: "comfortable", token: "" },
    });
    const r = importGithubData(payload);
    expect(r.ok).toBe(true);
    expect(r.imported).toBe(1);
    expect(r.skipped).toBe(1);
    // 本地数据保留，不被覆盖
    const exist = githubProjects.value.find((p) => p.id === "a/exist");
    expect(exist.readme).toBe("local kept");
  });

  it("token 合并：本地空 → 采用导入值", () => {
    githubToken.value = "";
    const payload = JSON.stringify({
      schema: "pulse.github.export.v1",
      exportedAt: 1000,
      projects: [],
      settings: { density: "comfortable", token: "github_pat_imported" },
    });
    importGithubData(payload);
    expect(githubToken.value).toBe("github_pat_imported");
  });

  it("token 合并：本地已有 → 保留本地", () => {
    githubToken.value = "github_pat_local";
    const payload = JSON.stringify({
      schema: "pulse.github.export.v1",
      exportedAt: 1000,
      projects: [],
      settings: { density: "comfortable", token: "github_pat_imported" },
    });
    importGithubData(payload);
    expect(githubToken.value).toBe("github_pat_local");
  });

  it("非法 JSON → {ok:false, reason:invalid_format}", () => {
    const r = importGithubData("not json at all {{{");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_format");
  });

  it("schema 不符 → {ok:false, reason:invalid_format}", () => {
    const r = importGithubData(JSON.stringify({ schema: "something.else", projects: [] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_format");
  });

  it("projects 非数组 → invalid_format", () => {
    const r = importGithubData(JSON.stringify({
      schema: "pulse.github.export.v1",
      projects: "not array",
    }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_format");
  });
});
