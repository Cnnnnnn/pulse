/**
 * src/main/ipc/register-open-url.js
 *
 * Universal "open URL in system browser" IPC bridge.
 * Validates URL is http/https to prevent arbitrary protocol abuse.
 *
 * Channel: open-url:open
 *   - payload: string URL (http or https only)
 *   - response: { ok: true } | { ok: false, reason: "unsafe_url" | "shell_failed" }
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { Shell } from "electron";

// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const { shell }: { shell: Shell } = require("electron");
import { mainLog } from "../log";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

function isSafeUrl(url: any) {
  if (typeof url !== "string" || url.length === 0) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function registerOpenUrlHandlers(ctx: any) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;
  safeHandle(
    "open-url:open",
    async (
      _evt: unknown,
      url: IpcChannelMap["open-url:open"]["args"][0],
    ) => {
    if (!isSafeUrl(url)) {
      mainLog.warn(`[ipc] open-url:open rejected unsafe url: ${url}`);
      return { ok: false, reason: "unsafe_url" };
    }
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err: any) {
      mainLog.warn(`[ipc] open-url:open failed: ${errMsg(err)}`);
      return { ok: false, reason: "shell_failed" };
    }
    },
  );
}

module.exports = { registerOpenUrlHandlers };
