/**
 * src/main/ipc/register-cli-packages.ts
 *
 * v3.2: CLI 包 (npm -g / pip / brew formulae) 版本监控 IPC.
 *
 * Channels:
 *   - cli-packages:fetch           → { ok, data }        读最近一次扫描结果
 *   - cli-packages:refresh         → { ok, data }        跑一轮扫描 (npm/pip/brew 并行; pip 可达 2 分钟)
 *   - cli-packages:toggle-ignore   → { ok, ignored }     忽略/恢复一个包
 *
 * 复用: cli-packages/service (refreshCliPackages / loadCliPackages / toggleCliPackageIgnore)
 */

import type {} from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

import {
  loadCliPackages,
  refreshCliPackages,
  toggleCliPackageIgnore,
  type CliPackagesState,
  type CliEcosystem,
} from "../cli-packages/service";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerCliPackagesHandlers(ctx: any) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("cli-packages:fetch", async () => {
    try {
      const data = loadCliPackages();
      const resp: IpcChannelMap["cli-packages:fetch"]["result"] = {
        ok: true,
        data: data as CliPackagesState | null,
      };
      return resp;
    } catch (err: unknown) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });

  safeHandle("cli-packages:refresh", async () => {
    try {
      const result = await refreshCliPackages();
      const resp: IpcChannelMap["cli-packages:refresh"]["result"] = {
        ok: true,
        data: {
          items: result.items,
          ignored: result.ignored,
          errors: result.errors,
          checkedAt: result.checkedAt,
        },
      };
      return resp;
    } catch (err: unknown) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });

  safeHandle(
    "cli-packages:toggle-ignore",
    async (_evt: unknown, opts: IpcChannelMap["cli-packages:toggle-ignore"]["args"][0]) => {
      try {
        if (!opts || typeof opts !== "object") {
          return { ok: false, reason: "bad_args" };
        }
        // string → CliEcosystem 收窄交给 service 内 CLI_ECOSYSTEMS 校验
        const r = toggleCliPackageIgnore(opts.ecosystem as CliEcosystem, opts.name);
        return r;
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );
}
