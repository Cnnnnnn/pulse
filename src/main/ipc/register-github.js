/**
 * src/main/ipc/register-github.js
 *
 * GitHub 优秀项目收录 — IPC 注册。
 *   github:fetch      → 解析地址 + 抓元数据 + README (src/main/github.js)
 *   ai:parse-readme   → README 智能解析 (src/ai/readme-parse.js)
 *
 * 2026-07-15 v2.80: 新增。
 */

const { fetchGithubProject } = require("../github");
const { parseReadme } = require("../../ai/readme-parse");

function registerGithubHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle(
    "github:fetch",
    async (_event, input) => {
      if (typeof input !== "string" || input.trim().length === 0) {
        return { ok: false, reason: "invalid_input" };
      }
      try {
        return await fetchGithubProject(input);
      } catch (err) {
        return { ok: false, reason: "fetch_failed", error: err && err.message };
      }
    },
    {
      logMeta: (_evt, input) => ({
        input: typeof input === "string" ? input.slice(0, 80) : null,
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
}

module.exports = { registerGithubHandlers };
