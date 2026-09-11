/**
 * src/main/ipc/register-upgrade-diagnostics.ts
 *
 * v3.0 alpha: 升级路径诊断 IPC.
 *
 * Channel: `upgrade-diagnostics:fetch` → 返回 {ok, stats, rows}
 *
 * ponytail: 不暴露 appendAttempt IPC — 写入由 runBulkUpgrade 的 onProgress
 *          调用方触发 (避免 renderer 绕过 bulk-upgrade 直接写 attempts).
 */

import type {} from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";
import { getStats, getRows } from "../upgrade-diagnostics";

// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerUpgradeDiagnosticsHandlers(ctx: any) {
  const { safeHandle, getCachedState } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle(
    "upgrade-diagnostics:fetch",
    async (_evt: unknown, _opts: IpcChannelMap["upgrade-diagnostics:fetch"]["args"][0]) => {
      try {
        const state =
          typeof getCachedState === "function" ? getCachedState() : null;
        if (!state || typeof state !== "object") {
          return {
            ok: true,
            stats: { upgradable: 0, autoPathable: 0, success30d: 0, failed30d: 0 },
            rows: [],
          };
        }
        return { ok: true, stats: getStats(state), rows: getRows(state) };
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );
}
