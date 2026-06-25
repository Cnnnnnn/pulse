/**
 * src/main/ipc/register-ai-feedback.js
 *
 * A8 — AI 反馈闭环 IPC.
 *   feedback:record  写一条反馈样本 (显式 👍/👎 或隐式 refreshed 等)
 *   feedback:export  读全部样本 (供 Settings 导出 / 后续当 few-shot 源)
 *
 * 持久化走 stateStore.loadAiFeedback / saveAiFeedback (默认 state.json path),
 * 与 register-ai-prompts 同一模式.
 */

const stateStore = require("../state-store");
const {
  recordFeedback,
  pruneToCap,
  FEEDBACK_CAP,
} = require("../ai-feedback-store");

function registerAiFeedbackHandlers(ctx) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("feedback:record", async (_evt, raw) => {
    if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_args" };
    // 必填: feature / appName / ts + (vote 或 implicit 至少一个)
    if (
      !raw.feature ||
      !raw.appName ||
      typeof raw.ts !== "number" ||
      (!raw.vote && !raw.implicit)
    ) {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      const current = stateStore.loadAiFeedback();
      const next = pruneToCap(recordFeedback(current, raw), FEEDBACK_CAP);
      stateStore.saveAiFeedback(next);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("feedback:export", async () => {
    try {
      return { ok: true, samples: stateStore.loadAiFeedback() };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerAiFeedbackHandlers };
