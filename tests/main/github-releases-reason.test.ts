/**
 * tests/main/github-releases-reason.test.js
 *
 * 验证 fetchRepoRelease / fetchRepoMeta 的错误分类与元信息透传。
 * 这是「检查更新」失败 toast 三层修复的主进程侧根基：
 *   - 限流 (403/429) 必须带 retryAfter + rateLimitRemaining，让 toast 能显示「剩余 N 次 / 约 X 分钟后重置」
 *   - 404 标记 permanent:true，让 store 能把它从 errorCount 拆出来不再每轮拖累整批
 *   - 5xx 改判 server_error（瞬时、非永久），区别于 404 的永久失败
 *
 * 注：github.js 模块内有 http() 单例 (CJS require), vi.mock 对 CJS 不稳
 * （见 github-auth.test.js:11 注释），故通过模块导出的 __setHttpForTest 钩子
 * 注入内存 stub，测试结束后复原。
 */
import { describe, it, expect, afterEach } from "vitest";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const {
  fetchRepoRelease,
  fetchRepoMeta,
  __setHttpForTest,
} = requireMain("github");

/** 构造一个 stub HttpClient.get，返回固定 response。 */
function stubGet(responder) {
  const fn = typeof responder === "function"
    ? responder
    : async () => responder;
  __setHttpForTest({ get: fn });
}

afterEach(() => {
  // 复位回真实 HttpClient 单例
  __setHttpForTest(null);
});

describe("fetchRepoRelease · 错误分类与元信息", () => {
  it("403 + x-ratelimit-remaining:0 + retry-after:1800 → rate_limited 带 retryAfter 与 rateLimitRemaining", async () => {
    stubGet({
      status: 403,
      body: "",
      headers: {
        "x-ratelimit-remaining": "0",
        "retry-after": "1800",
      },
    });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("rate_limited");
    expect(r.status).toBe(403);
    expect(r.retryAfter).toBe(1800);
    expect(r.rateLimitRemaining).toBe(0);
  });

  it("429 + x-ratelimit-reset 未来时间戳 → retryAfter 由 reset-now 推导（秒）", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600; // 10 分钟后
    stubGet({
      status: 429,
      body: "",
      headers: {
        "x-ratelimit-remaining": "3",
        "x-ratelimit-reset": String(reset),
      },
    });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.reason).toBe("rate_limited");
    expect(r.rateLimitRemaining).toBe(3);
    expect(r.retryAfter).toBeGreaterThanOrEqual(590);
    expect(r.retryAfter).toBeLessThanOrEqual(600);
  });

  it("404 → not_found + permanent:true（区别于瞬时错误）", async () => {
    stubGet({ status: 404, body: "", headers: {} });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
    expect(r.permanent).toBe(true);
  });

  it("502 → server_error（非永久，不再误判 not_found）", async () => {
    stubGet({ status: 502, body: "", headers: {} });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("server_error");
    expect(r.permanent).toBeUndefined();
  });

  it("200 + 非法 JSON → parse_error（回归保护）", async () => {
    stubGet({ status: 200, body: "not-json", headers: {} });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("parse_error");
  });

  it("200 + 空数组 → ok:true release:null（无 release 不是错误，回归保护）", async () => {
    stubGet({ status: 200, body: "[]", headers: {} });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.ok).toBe(true);
    expect(r.release).toBeNull();
    expect(r.releases).toEqual([]);
  });

  it("200 + 正常 release 列表 → ok 映射最新版", async () => {
    stubGet({
      status: 200,
      body: JSON.stringify([
        {
          tag_name: "v1.2.3",
          published_at: "2026-07-01T00:00:00Z",
          html_url: "https://github.com/o/r/releases/tag/v1.2.3",
          body: "release notes",
        },
      ]),
      headers: {},
    });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.ok).toBe(true);
    expect(r.release.version).toBe("1.2.3");
    expect(r.release.tagName).toBe("v1.2.3");
  });

  it("network error (status:0, error:network) → network_error", async () => {
    stubGet({ status: 0, body: "", headers: {}, error: "network" });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("network_error");
  });

  it("timeout (status:0, error:timeout) → timeout", async () => {
    stubGet({ status: 0, body: "", headers: {}, error: "timeout" });
    const r = await fetchRepoRelease("owner", "repo", "");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("timeout");
  });

  it("401 → auth_invalid（回归保护，不被误判 not_found）", async () => {
    stubGet({ status: 401, body: "", headers: {} });
    const r = await fetchRepoRelease("owner", "repo", "bad-token");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("auth_invalid");
  });
});

describe("fetchRepoMeta · 对称分类（添加项目链路同一类问题）", () => {
  it("403 + retry-after → rate_limited 带 retryAfter", async () => {
    stubGet({
      status: 403,
      body: "",
      headers: { "retry-after": "1200", "x-ratelimit-remaining": "0" },
    });
    const r = await fetchRepoMeta("owner", "repo", "");
    expect(r.reason).toBe("rate_limited");
    expect(r.retryAfter).toBe(1200);
    expect(r.rateLimitRemaining).toBe(0);
  });

  it("404 → not_found + permanent:true", async () => {
    stubGet({ status: 404, body: "", headers: {} });
    const r = await fetchRepoMeta("owner", "repo", "");
    expect(r.reason).toBe("not_found");
    expect(r.permanent).toBe(true);
  });

  it("503 → server_error（非永久）", async () => {
    stubGet({ status: 503, body: "", headers: {} });
    const r = await fetchRepoMeta("owner", "repo", "");
    expect(r.reason).toBe("server_error");
    expect(r.permanent).toBeUndefined();
  });
});
