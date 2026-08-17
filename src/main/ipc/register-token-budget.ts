/**
 * src/main/ipc/register-token-budget.js
 *
 * P71 — token 预算 IPC.
 *   token-budget:get  读 config + 当日已用 token 数
 *   token-budget:set  写 config (dailyLimit + mode)
 *
 * 与 register-ai-prompts 同模式 (stateStore 用默认 path).
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
import { todayKey } from "../token-budget";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

export function registerTokenBudgetHandlers(ctx: any) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("token-budget:get", async () => {
    try {
      const config = stateStore.loadTokenBudgetConfig();
      const spend = stateStore.loadTokenSpend();
      return { ok: true, config, todaySpend: spend[todayKey()] || 0 };
    } catch (err: any) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });

  safeHandle(
    "token-budget:set",
    async (
      _evt: unknown,
      cfg: IpcChannelMap["token-budget:set"]["args"][0],
    ) => {
    if (!cfg || typeof cfg !== "object") return { ok: false, reason: "invalid_args" };
    if (typeof cfg.dailyLimit !== "number" || cfg.dailyLimit < 0) {
      return { ok: false, reason: "invalid_args" };
    }
    if (cfg.mode !== "warn" && cfg.mode !== "block") {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      stateStore.saveTokenBudgetConfig({
        dailyLimit: cfg.dailyLimit,
        mode: cfg.mode,
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
    },
  );
}

module.exports = { registerTokenBudgetHandlers };
