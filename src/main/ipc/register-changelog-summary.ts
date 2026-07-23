/**
 * src/main/ipc/register-changelog-summary.js
 *
 * A1 — changelog-summary:fetch IPC.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";

const { fetchChangelogSummary } = require("../../ai/changelog-summary");

function registerChangelogSummaryHandlers(ctx) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("changelog-summary:fetch", async (_evt, opts) => {
    try {
      return await fetchChangelogSummary(opts || {});
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerChangelogSummaryHandlers };
