/**
 * tests/main/github-auth.test.js
 *
 * 验证 GitHub token 鉴权：
 *  - authHeader(token) 在 token 存在时产出 `Authorization: Bearer <token>`（trim 后），
 *    空 token 时返回空对象（未认证路径）。
 *  - getEnvGithubToken 优先返回进程环境变量（回退 .env）。
 *  - 项目根 .env 已 seed（gitignored），主进程启动可读到兜底 token。
 *
 * 注：主进程走 CJS require，vite module graph 下 vi.mock 拦截 CJS require 不稳，
 * 故直接对纯函数 authHeader / getEnvGithubToken 做单测（token 透传到 fetch* 的 headers
 * 仅一行 authHeader(token) 拼接，已被此单测覆盖）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { authHeader, getEnvGithubToken } from "../../src/main/github.js";

describe("github main · token 鉴权", () => {
  const prev = process.env.GITHUB_TOKEN;
  afterEach(() => {
    if (prev === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = prev;
  });

  it("authHeader 带 token 时产出 Bearer 头", () => {
    expect(authHeader("my-token")).toEqual({ Authorization: "Bearer my-token" });
  });

  it("authHeader 对首尾空白做 trim", () => {
    expect(authHeader("  tok-123  ")).toEqual({
      Authorization: "Bearer tok-123",
    });
  });

  it("authHeader 空串返回空对象（未认证路径）", () => {
    expect(authHeader("")).toEqual({});
    expect(authHeader(undefined)).toEqual({});
  });

  it("getEnvGithubToken 优先返回进程环境变量", () => {
    process.env.GITHUB_TOKEN = "envtok123";
    expect(getEnvGithubToken()).toBe("envtok123");
  });

  it("项目根 .env 已 seed GitHub token（gitignored 兜底）", () => {
    const envPath = join(process.cwd(), ".env");
    expect(existsSync(envPath)).toBe(true);
    const txt = readFileSync(envPath, "utf8");
    // 匹配 GITHUB_TOKEN=... 且值以 github_pat_ 开头（不打印完整令牌）
    const m = txt.match(/^\s*GITHUB_TOKEN\s*=\s*(.+?)\s*$/m);
    expect(m).not.toBeNull();
    expect(m[1].startsWith("github_pat_")).toBe(true);
  });
});
