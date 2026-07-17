// @vitest-environment happy-dom
/**
 * tests/renderer/github-projects-store.test.js
 *
 * 覆盖 Release 更新追踪的两项扩展：
 *  - markGithubAllSeen 批量标记已读（仅标记有更新的项，返回计数）
 *  - 视图密度偏好（githubDensity / setGithubDensity / loadGithubSettings）持久化
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  githubProjects,
  githubDensity,
  githubToken,
  markGithubAllSeen,
  setGithubDensity,
  setGithubToken,
  loadGithubSettings,
  githubReasonText,
  addGithubProject,
  addGithubProjectsBatch,
  __resetQuotaWarnForTest,
} from "../../src/renderer/store/github-projects-store.js";
import { api } from "../../src/renderer/api.js";
import { toast, clearToasts } from "../../src/renderer/store/toast-store.js";

function seed(items) {
  githubProjects.value = items.map((x) => ({
    id: x.id,
    name: x.id,
    latestVersion: x.latestVersion || "",
    lastSeenVersion: x.lastSeenVersion || "",
    releases: x.releases || [],
    releaseFetchedAt: x.releaseFetchedAt || 0,
  }));
}

describe("github store · 批量已读 + 视图密度", () => {
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

  it("markGithubAllSeen 仅标记有更新的项目，返回计数", () => {
    seed([
      { id: "a/b", latestVersion: "2.0.0", lastSeenVersion: "1.0.0" },
      { id: "c/d", latestVersion: "1.0.0", lastSeenVersion: "1.0.0" },
      { id: "e/f", latestVersion: "", lastSeenVersion: "" },
    ]);
    const n = markGithubAllSeen();
    expect(n).toBe(1);
    const a = githubProjects.value.find((p) => p.id === "a/b");
    const c = githubProjects.value.find((p) => p.id === "c/d");
    expect(a.lastSeenVersion).toBe("2.0.0");
    expect(c.lastSeenVersion).toBe("1.0.0"); // 已最新项不变
  });

  it("markGithubAllSeen 无更新时返回 0 且不写回", () => {
    seed([{ id: "a/b", latestVersion: "1.0.0", lastSeenVersion: "1.0.0" }]);
    const n = markGithubAllSeen();
    expect(n).toBe(0);
    expect(githubProjects.value[0].lastSeenVersion).toBe("1.0.0");
  });

  it("setGithubDensity 写信号并持久化", () => {
    setGithubDensity("compact");
    expect(githubDensity.value).toBe("compact");
    const raw = globalThis.localStorage.getItem("pulse.github.settings.v1");
    expect(raw).toContain("compact");
  });

  it("loadGithubSettings 从持久化恢复密度", () => {
    setGithubDensity("compact");
    githubDensity.value = "comfortable";
    loadGithubSettings();
    expect(githubDensity.value).toBe("compact");
  });

  it("setGithubDensity 拒绝非法值", () => {
    setGithubDensity("compact");
    setGithubDensity("weird");
    expect(githubDensity.value).toBe("compact");
  });

  it("setGithubToken 写信号并持久化（token 不被提交到版本库）", () => {
    setGithubToken("github_pat_demo123");
    expect(githubToken.value).toBe("github_pat_demo123");
    const raw = globalThis.localStorage.getItem("pulse.github.settings.v1");
    expect(raw).toContain("github_pat_demo123");
    expect(raw).toContain("comfortable"); // 密度也一并保留
  });

  it("setGithubToken 去除首尾空白", () => {
    setGithubToken("  github_pat_x  ");
    expect(githubToken.value).toBe("github_pat_x");
  });

  it("loadGithubSettings 从持久化恢复 token", () => {
    setGithubToken("github_pat_restore");
    githubToken.value = "";
    loadGithubSettings();
    expect(githubToken.value).toBe("github_pat_restore");
  });

  it("setGithubDensity 不会清掉已保存的 token", () => {
    setGithubToken("github_pat_keep");
    setGithubDensity("compact");
    expect(githubToken.value).toBe("github_pat_keep");
    const raw = globalThis.localStorage.getItem("pulse.github.settings.v1");
    expect(raw).toContain("github_pat_keep");
    expect(raw).toContain("compact");
  });

  it("setGithubToken('') 清除令牌", () => {
    setGithubToken("github_pat_tmp");
    setGithubToken("");
    expect(githubToken.value).toBe("");
    const raw = globalThis.localStorage.getItem("pulse.github.settings.v1");
    expect(raw).not.toContain("github_pat_tmp");
  });

  it("githubReasonText: auth_invalid 指引重新生成 Token", () => {
    const t = githubReasonText("auth_invalid");
    expect(t).toContain("Token");
    expect(t).toContain("重新生成");
  });
});

describe("github store · 配额超限感知", () => {
  beforeEach(() => {
    githubProjects.value = [];
    clearToasts();
    __resetQuotaWarnForTest();
    try {
      globalThis.localStorage.clear();
    } catch {
      /* happy-dom 无 localStorage 时忽略 */
    }
  });

  /** mock localStorage.setItem 抛 QuotaExceededError，返回还原函数。 */
  function mockQuotaExceeded() {
    const spy = vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {
      const err = new Error("quota exceeded");
      err.name = "QuotaExceededError";
      throw err;
    });
    return () => spy.mockRestore();
  }

  it("addGithubProject 配额超限时：仍返回 ok:true + persistFailed:true，且 toast 警告", async () => {
    const restore = mockQuotaExceeded();
    // mock api.githubFetch 避免真打网络
    api.githubFetch = async () => ({
      ok: true,
      owner: "o",
      repo: "r",
      meta: { name: "o/r", htmlUrl: "https://github.com/o/r" },
      readme: "# hi",
    });
    const beforeLen = toast.value.length;
    const r = await addGithubProject("https://github.com/o/r");
    restore();
    // 项目已进入内存 signal（当次可见）
    expect(r.ok).toBe(true);
    expect(r.persistFailed).toBe(true);
    expect(githubProjects.value.length).toBe(1);
    // toast 至少新增一条 warn
    const afterLen = toast.value.length;
    expect(afterLen).toBeGreaterThan(beforeLen);
    const last = toast.value[afterLen - 1];
    expect(last.type).toBe("warn");
    expect(last.message).toMatch(/存储|满|导出|清理/);
  });

  it("60 秒内多次配额超限：toast 只 warn 一次（debounce）", async () => {
    const restore = mockQuotaExceeded();
    api.githubFetch = async (input) => ({
      ok: true,
      owner: input.split("/")[3],
      repo: input.split("/")[4],
      meta: { name: input, htmlUrl: input },
      readme: "",
    });
    const beforeLen = toast.value.length;
    await addGithubProject("https://github.com/a/a1");
    await addGithubProject("https://github.com/a/a2");
    await addGithubProject("https://github.com/a/a3");
    restore();
    const newToasts = toast.value.slice(beforeLen).filter((t) => t.type === "warn");
    expect(newToasts.length).toBe(1);
  });

  it("正常落盘时 addGithubProject 返回 ok:true 且无 persistFailed", async () => {
    api.githubFetch = async () => ({
      ok: true,
      owner: "o",
      repo: "r2",
      meta: { name: "o/r2", htmlUrl: "https://github.com/o/r2" },
      readme: "",
    });
    const r = await addGithubProject("https://github.com/o/r2");
    expect(r.ok).toBe(true);
    expect(r.persistFailed).toBeUndefined();
  });
});

describe("github store · 批量导入 addGithubProjectsBatch", () => {
  beforeEach(() => {
    githubProjects.value = [];
    githubToken.value = "";
    __resetQuotaWarnForTest();
    try {
      globalThis.localStorage.clear();
    } catch {
      /* happy-dom 无 localStorage 时忽略 */
    }
  });

  /** mock api.githubFetch：按 owner 区分成功/重复/失败 */
  function mockFetchScenarios() {
    api.githubFetch = async (input) => {
      // 已存在的会在 addGithubProject 里被 duplicate 拦截，不会到 api
      return {
        ok: true,
        owner: input.split("/")[3],
        repo: input.split("/")[4],
        meta: { name: input, htmlUrl: input },
        readme: "",
      };
    };
  }

  it("3 个新地址 → added=3, duplicates=0, failed=0", async () => {
    mockFetchScenarios();
    const r = await addGithubProjectsBatch([
      "https://github.com/a/a1",
      "https://github.com/b/b2",
      "https://github.com/c/c3",
    ]);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(3);
    expect(r.duplicates).toBe(0);
    expect(r.failed.length).toBe(0);
    expect(githubProjects.value.length).toBe(3);
  });

  it("含 1 个已存在 → duplicates=1, added=2", async () => {
    mockFetchScenarios();
    // 先单独添加一个
    await addGithubProject("https://github.com/a/exist");
    const r = await addGithubProjectsBatch([
      "https://github.com/a/exist", // 已存在
      "https://github.com/b/new1",
      "https://github.com/c/new2",
    ]);
    expect(r.added).toBe(2);
    expect(r.duplicates).toBe(1);
    expect(r.failed.length).toBe(0);
    expect(githubProjects.value.length).toBe(3);
  });

  it("空数组 → added=0 不报错", async () => {
    const r = await addGithubProjectsBatch([]);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(0);
  });

  it("串行执行（按顺序，不并发）", async () => {
    const calls = [];
    api.githubFetch = async (input) => {
      calls.push(input);
      return {
        ok: true,
        owner: input.split("/")[3],
        repo: input.split("/")[4],
        meta: { name: input, htmlUrl: input },
        readme: "",
      };
    };
    await addGithubProjectsBatch([
      "https://github.com/a/first",
      "https://github.com/b/second",
      "https://github.com/c/third",
    ]);
    // 串行 → 调用顺序严格等于输入顺序
    expect(calls).toEqual([
      "https://github.com/a/first",
      "https://github.com/b/second",
      "https://github.com/c/third",
    ]);
  });
});
