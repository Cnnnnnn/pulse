/**
 * src/main/ipc/register-github.js
 *
 * GitHub 优秀项目收录 — IPC 注册。
 *   github:fetch      → 解析地址 + 抓元数据 + README (src/main/github.js)
 *   ai:parse-readme   → README 智能解析 (src/ai/readme-parse.js)
 *
 * 2026-07-15 v2.80: 新增。
 */


// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { fetchGithubProject, fetchRepoRelease, getEnvGithubToken, parseGithubUrl } from "../github";
import { getSecretValue } from "../vault/secret-vault";
import { parseReadme } from "../../ai/readme-parse";

/** 密钥库 "github" 条目 > renderer 传入 > .env / 进程环境变量 (v2.83 迁移后 token 只存密钥库)。 */
function resolveToken(passed: unknown) {
  const vaultToken = getSecretValue("github");
  const t = typeof passed === "string" ? passed.trim() : "";
  return vaultToken || t || getEnvGithubToken();
}

export function registerGithubHandlers(ctx: any) {
  const { safeHandle } = ctx;

  safeHandle(
    "github:fetch",
    async (
      _event: unknown,
      payload: IpcChannelMap["github:fetch"]["args"][0],
    ) => {
      const input =
        payload && typeof payload === "object" ? payload.input : payload;
      if (typeof input !== "string" || input.trim().length === 0) {
        return { ok: false, reason: "invalid_input" };
      }
      try {
        return await fetchGithubProject(input, resolveToken(payload && payload.token));
      } catch (err: unknown) {
        return { ok: false, reason: "fetch_failed", error: errMsg(err) };
      }
    },
    {
      logMeta: (
        _evt: unknown,
        payload: IpcChannelMap["github:fetch"]["args"][0],
      ) => ({
        input:
          payload && typeof payload.input === "string"
            ? payload.input.slice(0, 80)
            : null,
      }),
    },
  );

  safeHandle(
    "ai:parse-readme",
    async (
      _event: unknown,
      payload: IpcChannelMap["ai:parse-readme"]["args"][0],
    ) => {
      if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "invalid_payload" };
      }
      try {
        return await parseReadme({
          projectName: payload.projectName,
          description: payload.description,
          readme: payload.readme,
        });
      } catch (err: unknown) {
        return { ok: false, reason: "parse_failed", error: errMsg(err) };
      }
    },
    {
      logMeta: (
        _evt: unknown,
        p: IpcChannelMap["ai:parse-readme"]["args"][0],
      ) => ({ project: p && p.projectName }),
    },
  );

  safeHandle(
    "github:fetch-release",
    async (
      _event: unknown,
      payload: IpcChannelMap["github:fetch-release"]["args"][0],
    ) => {
      const input =
        payload && typeof payload === "object" ? payload.input : payload;
      if (typeof input !== "string" || input.trim().length === 0) {
        return { ok: false, reason: "invalid_input" };
      }
      const parsed = parseGithubUrl(input);
      if (!parsed) return { ok: false, reason: "invalid_url" };
      try {
        return await fetchRepoRelease(
          parsed.owner,
          parsed.repo,
          resolveToken(payload && payload.token),
        );
      } catch (err: unknown) {
        return { ok: false, reason: "fetch_failed", error: errMsg(err) };
      }
    },
    {
      logMeta: (
        _evt: unknown,
        payload: IpcChannelMap["github:fetch-release"]["args"][0],
      ) => ({
        input:
          payload && typeof payload.input === "string"
            ? payload.input.slice(0, 80)
            : null,
      }),
    },
  );
}

module.exports = { registerGithubHandlers };
