/**
 * src/main/ipc/register-changelog-summary.js
 *
 * A1 — changelog-summary:fetch IPC.
 */

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
