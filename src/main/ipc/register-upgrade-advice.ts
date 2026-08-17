/**
 * src/main/ipc/register-upgrade-advice.js
 *
 * A2 — upgrade-advice:fetch IPC.
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { fetchUpgradeAdvice } from "../../ai/upgrade-advice";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

export function registerUpgradeAdviceHandlers(ctx: any) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle(
    "upgrade-advice:fetch",
    async (
      _evt: unknown,
      opts: IpcChannelMap["upgrade-advice:fetch"]["args"][0],
    ) => {
    try {
      return await fetchUpgradeAdvice(opts || {});
    } catch (err: any) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
    },
  );
}

module.exports = { registerUpgradeAdviceHandlers };
