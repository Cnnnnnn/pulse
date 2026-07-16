/**
 * src/main/ipc/register-github.js
 *
 * GitHub 优秀项目收录 — IPC 注册。
 *   github:fetch      → 解析地址 + 抓元数据 + README (src/main/github.js)
 *   ai:parse-readme   → README 智能解析 (src/ai/readme-parse.js)
 *
 * 2026-07-15 v2.80: 新增。
 */

const { fetchGithubProject, fetchRepoRelease, getEnvGithubToken } = require("../github");
const { parseReadme } = require("../../ai/readme-parse");

/** 优先用 renderer 传入的 token；为空则回退 .env / 进程环境变量。 */
function resolveToken(passed) {
  const t = typeof passed === "string" ? passed.trim() : "";
  return t || getEnvGithubToken();
}

function registerGithubHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle(
    "github:fetch",
    async (_event, payload) => {
      const input =
        payload && typeof payload === "object" ? payload.input : payload;
      if (typeof input !== "string" || input.trim().length === 0) {
        return { ok: false, reason: "invalid_input" };
      }
      try {
        return await fetchGithubProject(input, resolveToken(payload && payload.token));
      } catch (err) {
        return { ok: false, reason: "fetch_failed", error: err && err.message };
      }
    },
    {
      logMeta: (_evt, payload) => ({
        input:
          payload && typeof payload.input === "string"
            ? payload.input.slice(0, 80)
            : null,
      }),
    },
  );

  safeHandle(
    "ai:parse-readme",
    async (_event, payload) => {
      if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "invalid_payload" };
      }
      try {
        return await parseReadme({
          projectName: payload.projectName,
          description: payload.description,
          readme: payload.readme,
        });
      } catch (err) {
        return { ok: false, reason: "parse_failed", error: err && err.message };
      }
    },
    {
      logMeta: (_evt, p) => ({ project: p && p.projectName }),
    },
  );

  safeHandle(
    "github:fetch-release",
    async (_event, payload) => {
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
      } catch (err) {
        return { ok: false, reason: "fetch_failed", error: err && err.message };
      }
    },
    {
      logMeta: (_evt, payload) => ({
        input:
          payload && typeof payload.input === "string"
            ? payload.input.slice(0, 80)
            : null,
      }),
    },
  );
}

module.exports = { registerGithubHandlers };
