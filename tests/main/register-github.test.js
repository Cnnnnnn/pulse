/**
 * tests/main/register-github.test.js
 *
 * IPC 层 github handler 的冒烟测试，专门保护一个真实发生过的回归：
 *
 *   2026-07-17 用户报告「检查更新全部失败」，日志显示
 *   `[ipc] github:fetch-release threw msg="parseGithubUrl is not defined"`
 *
 * 根因：register-github.js 顶部 require 解构漏了 parseGithubUrl，但 handler 内部
 * 第 76 行 `parseGithubUrl(input)` 调用了一个未定义标识符 → ReferenceError →
 * safeHandle catch 成 {ok:false, reason:"threw"} → 前端 reason 不在映射表 →
 * 走 default「操作失败，请重试」。
 *
 * 这个 bug 持续存在是因为之前没有 IPC 层测试覆盖。本测试直接调用 handler，
 * 确保任何 URL 都能让 handler 走到 fetchRepoRelease 而不是抛 ReferenceError。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const registerPath = require.resolve(
  "../../src/main/ipc/register-github.js",
);
const githubPath = require.resolve("../../src/main/github.js");
const aiPath = require.resolve("../../src/ai/readme-parse.js");

/** 构造一个不会真打网络的 stub http。 */
function stubGithubModule() {
  vi.resetModules();
  // 真实 github.js，但通过 __setHttpForTest 注入 stub，避免真发请求。
  // 同时保留所有纯函数（parseGithubUrl / authHeader / parseRateLimitHeaders）真实实现。
  delete require.cache[registerPath];
  delete require.cache[githubPath];
  // ai/readme-parse 用 stub，避免拉起真实 LLM 依赖
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: { parseReadme: async () => ({ ok: true, result: {} }) },
  };
}

beforeEach(() => {
  stubGithubModule();
});

/**
 * 加载 handlers，用测试版 safeHandle 捕获注册的 handler 函数。
 * 行为对齐生产 safeHandle：try/catch 包裹，异常 → {ok:false, reason:"threw"}。
 */
function loadHandlers() {
  const { registerGithubHandlers } = require(registerPath);
  const handlers = {};
  const safeHandle = (ch, fn) => {
    handlers[ch] = async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        return { ok: false, reason: "threw", error: err && err.message };
      }
    };
  };
  registerGithubHandlers({ safeHandle });
  return handlers;
}

describe("github:fetch-release IPC handler · 不应抛 ReferenceError", () => {
  it("合法 URL → 调用 fetchRepoRelease，返回 ok:true（不抛 parseGithubUrl is not defined）", async () => {
    const github = require(githubPath);
    // 注入 stub http，让 fetchRepoRelease 拿到固定的 release 列表
    github.__setHttpForTest({
      get: async () => ({
        status: 200,
        body: JSON.stringify([
          {
            tag_name: "v1.0.0",
            published_at: "2026-07-01T00:00:00Z",
            html_url: "https://github.com/o/r/releases/tag/v1.0.0",
            body: "notes",
          },
        ]),
        headers: {},
      }),
    });
    const handlers = loadHandlers();
    const r = await handlers["github:fetch-release"](
      {},
      { input: "https://github.com/zhangxiangliang/stock-api", token: "" },
    );
    // 关键断言：不能是 threw
    expect(r.reason).not.toBe("threw");
    expect(r.ok).toBe(true);
    expect(r.release.version).toBe("1.0.0");
  });

  it("reason !== 'threw'：复现用户报告的失败现象（回归保护）", async () => {
    const github = require(githubPath);
    github.__setHttpForTest({
      get: async () => ({ status: 404, body: "", headers: {} }),
    });
    const handlers = loadHandlers();
    const r = await handlers["github:fetch-release"](
      {},
      { input: "https://github.com/any/repo", token: "" },
    );
    // 即便仓库 404，reason 也必须是 not_found，而不是 threw
    expect(r.reason).not.toBe("threw");
    expect(r.reason).toBe("not_found");
    expect(r.permanent).toBe(true);
  });

  it("非法 input → invalid_input，不抛", async () => {
    const handlers = loadHandlers();
    const r = await handlers["github:fetch-release"]({}, { input: "" });
    expect(r.reason).not.toBe("threw");
    expect(r.ok).toBe(false);
  });
});

describe("github:fetch IPC handler · 同样不应受影响", () => {
  it("合法 URL → 不抛 ReferenceError", async () => {
    const github = require(githubPath);
    github.__setHttpForTest({
      get: async () => ({
        status: 200,
        body: JSON.stringify({
          full_name: "o/r",
          description: "d",
          stargazers_count: 10,
          default_branch: "main",
        }),
        headers: {},
      }),
    });
    const handlers = loadHandlers();
    const r = await handlers["github:fetch"](
      {},
      { input: "https://github.com/o/r", token: "" },
    );
    expect(r.reason).not.toBe("threw");
    expect(r.ok).toBe(true);
  });
});
