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

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import * as stateStore from "../state-store";
import type { IpcChannelMap } from "../../shared/ipc-contracts";
const {
  recordFeedback,
  pruneToCap,
  FEEDBACK_CAP,
} = require("../ai-feedback-store.ts");

export function registerAiFeedbackHandlers(ctx: any) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle(
    "feedback:record",
    async (
      _evt: unknown,
      raw: IpcChannelMap["feedback:record"]["args"][0],
    ) => {
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
    } catch (err: any) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
    },
  );

  safeHandle("feedback:export", async () => {
    try {
      return { ok: true, samples: stateStore.loadAiFeedback() };
    } catch (err: any) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });
}

module.exports = { registerAiFeedbackHandlers };
