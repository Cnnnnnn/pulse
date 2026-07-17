// @vitest-environment happy-dom
/**
 * tests/renderer/github-check-aggregation.test.js
 *
 * 验证 checkGithubUpdates 把「永久失败 (permanent)」与「瞬时失败」分开计数，
 * 以及 fetchGithubRelease 透传 retryAfter / rateLimitRemaining / permanent。
 *
 * 这是「检查更新老显示失败 toast」根因 B/C 的 store 侧修复：
 *   - 一个被删/私有的仓库 (permanent not_found) 不应每轮把整批拖成「失败」。
 *   - 限流 (rate_limited) 应带 retryAfter，让 toast 能显示具体几分钟。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "../../src/renderer/api.js";
import {
  githubProjects,
  githubToken,
  checkGithubUpdates,
  fetchGithubRelease,
  retryFailedGithubUpdates,
  lastFailedIds,
} from "../../src/renderer/store/github-projects-store.js";

function seed(items) {
  githubProjects.value = items.map((x) => ({
    id: x.id,
    name: x.id,
    owner: x.id.split("/")[0],
    repo: x.id.split("/")[1],
    latestVersion: "",
    lastSeenVersion: "",
    releases: [],
    releaseFetchedAt: 0,
    ...x,
  }));
}

beforeEach(() => {
  githubProjects.value = [];
  githubToken.value = "";
});

describe("checkGithubUpdates · permanent 失败不拖累整批", () => {
  it("1 个 permanent not_found + 9 个成功无新版 → errorCount===0, skippedCount===1", async () => {
    seed([
      { id: "a/a1" }, { id: "a/a2" }, { id: "a/a3" }, { id: "a/a4" },
      { id: "a/a5" }, { id: "a/a6" }, { id: "a/a7" }, { id: "a/a8" },
      { id: "a/a9" },
      { id: "x/deleted" },
    ]);
    api.githubFetchRelease = async (input) => {
      if (input.includes("x/deleted")) {
        return { ok: false, reason: "not_found", permanent: true, status: 404 };
      }
      return { ok: true, release: { version: "1.0.0" }, releases: [] };
    };
    const r = await checkGithubUpdates();
    expect(r.ok).toBe(true);
    expect(r.errorCount).toBe(0);
    expect(r.skippedCount).toBe(1);
    expect(r.failedProjects).toEqual([]);
    expect(r.skippedProjects.length).toBe(1);
    expect(r.skippedProjects[0].id).toBe("x/deleted");
    expect(r.skippedProjects[0].reason).toBe("not_found");
  });

  it("rate_limited 应计入 errorCount 并携带 retryAfter / rateLimitRemaining", async () => {
    seed([{ id: "a/limited" }]);
    api.githubFetchRelease = async () => ({
      ok: false,
      reason: "rate_limited",
      status: 403,
      retryAfter: 1800,
      rateLimitRemaining: 0,
    });
    const r = await checkGithubUpdates();
    expect(r.errorCount).toBe(1);
    expect(r.skippedCount).toBe(0);
    expect(r.failedProjects[0].reason).toBe("rate_limited");
    expect(r.failedProjects[0].retryAfter).toBe(1800);
    expect(r.failedProjects[0].rateLimitRemaining).toBe(0);
  });

  it("server_error (5xx) 应计入 errorCount，不进 skipped（非永久）", async () => {
    seed([{ id: "a/server" }]);
    api.githubFetchRelease = async () => ({
      ok: false,
      reason: "server_error",
      status: 502,
    });
    const r = await checkGithubUpdates();
    expect(r.errorCount).toBe(1);
    expect(r.skippedCount).toBe(0);
    expect(r.failedProjects[0].reason).toBe("server_error");
  });

  it("发现新版本 + 1 个 permanent 失败 → newCount 计入、skippedCount 计入、errorCount===0", async () => {
    // 项目已收录 v1.0.0，后端返回 v2.0.0 → 有更新
    seed([
      { id: "a/hasupdate", latestVersion: "1.0.0", lastSeenVersion: "1.0.0" },
      { id: "x/gone" },
    ]);
    api.githubFetchRelease = async (input) => {
      if (input.includes("x/gone")) {
        return { ok: false, reason: "not_found", permanent: true, status: 404 };
      }
      return {
        ok: true,
        release: { version: "2.0.0", publishedAt: Date.now() },
        releases: [{ version: "2.0.0" }],
      };
    };
    const r = await checkGithubUpdates();
    expect(r.newCount).toBe(1);
    expect(r.errorCount).toBe(0);
    expect(r.skippedCount).toBe(1);
  });

  it("空列表 → ok:true 全 0", async () => {
    seed([]);
    const r = await checkGithubUpdates();
    expect(r.ok).toBe(true);
    expect(r.newCount).toBe(0);
    expect(r.errorCount).toBe(0);
    expect(r.skippedCount).toBe(0);
  });
});

describe("fetchGithubRelease · 透传元信息", () => {
  it("rate_limited 的 retryAfter/rateLimitRemaining 透出到返回值", async () => {
    seed([{ id: "a/limited" }]);
    api.githubFetchRelease = async () => ({
      ok: false,
      reason: "rate_limited",
      status: 403,
      retryAfter: 600,
      rateLimitRemaining: 2,
    });
    const r = await fetchGithubRelease("a/limited");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("rate_limited");
    expect(r.retryAfter).toBe(600);
    expect(r.rateLimitRemaining).toBe(2);
  });

  it("permanent 透出到返回值", async () => {
    seed([{ id: "a/gone" }]);
    api.githubFetchRelease = async () => ({
      ok: false,
      reason: "not_found",
      status: 404,
      permanent: true,
    });
    const r = await fetchGithubRelease("a/gone");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
    expect(r.permanent).toBe(true);
  });
});

describe("checkGithubUpdates · 记录失败项 + retryFailedGithubUpdates", () => {
  beforeEach(() => {
    githubProjects.value = [];
    githubToken.value = "";
    lastFailedIds.value = [];
  });

  it("检查结束 → lastFailedIds === 本轮失败项的 id 列表", async () => {
    seed([{ id: "a/ok" }, { id: "b/fail" }, { id: "c/fail" }]);
    api.githubFetchRelease = async (input) => {
      if (input.includes("/fail")) {
        return { ok: false, reason: "rate_limited", status: 403 };
      }
      return { ok: true, release: { version: "1.0.0" }, releases: [] };
    };
    await checkGithubUpdates();
    expect(lastFailedIds.value).toEqual(["b/fail", "c/fail"]);
  });

  it("全部成功 → lastFailedIds 清空为 []", async () => {
    lastFailedIds.value = ["stale/x"];
    seed([{ id: "a/ok" }, { id: "b/ok" }]);
    api.githubFetchRelease = async () => ({ ok: true, release: { version: "1.0.0" }, releases: [] });
    await checkGithubUpdates();
    expect(lastFailedIds.value).toEqual([]);
  });

  it("retryFailedGithubUpdates 只重试 lastFailedIds 里的项目，不碰其他", async () => {
    seed([{ id: "a/ok" }, { id: "b/fail" }, { id: "c/fail" }]);
    lastFailedIds.value = ["b/fail", "c/fail"];
    const called = [];
    api.githubFetchRelease = async (input) => {
      called.push(input);
      return { ok: true, release: { version: "1.0.0" }, releases: [] };
    };
    const r = await retryFailedGithubUpdates();
    // 只调了 b/fail 和 c/fail，没碰 a/ok
    expect(called.length).toBe(2);
    expect(called.some((u) => u.includes("a/ok"))).toBe(false);
    expect(r.errorCount).toBe(0);
    expect(r.ok).toBe(true);
    // 全部重试成功 → 清空
    expect(lastFailedIds.value).toEqual([]);
  });

  it("重试后仍失败的 → lastFailedIds 更新为本次仍失败的", async () => {
    seed([{ id: "b/recovered" }, { id: "c/stillbad" }]);
    lastFailedIds.value = ["b/recovered", "c/stillbad"];
    api.githubFetchRelease = async (input) => {
      if (input.includes("stillbad")) {
        return { ok: false, reason: "rate_limited", status: 403 };
      }
      return { ok: true, release: { version: "2.0.0" }, releases: [] };
    };
    const r = await retryFailedGithubUpdates();
    expect(r.errorCount).toBe(1);
    expect(lastFailedIds.value).toEqual(["c/stillbad"]);
  });

  it("lastFailedIds 为空 → retry 立即返回 ok 不调 api", async () => {
    lastFailedIds.value = [];
    let called = false;
    api.githubFetchRelease = async () => { called = true; return { ok: true }; };
    const r = await retryFailedGithubUpdates();
    expect(called).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.errorCount).toBe(0);
  });
});
