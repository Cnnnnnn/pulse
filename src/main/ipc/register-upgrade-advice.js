/**
 * src/main/ipc/register-upgrade-advice.js
 *
 * A2 — upgrade-advice:fetch IPC.
 */

const { fetchUpgradeAdvice } = require("../../ai/upgrade-advice");

function registerUpgradeAdviceHandlers(ctx) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("upgrade-advice:fetch", async (_evt, opts) => {
    try {
      return await fetchUpgradeAdvice(opts || {});
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerUpgradeAdviceHandlers };
