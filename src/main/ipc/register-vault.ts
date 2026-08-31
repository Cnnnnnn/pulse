/**
 * src/main/ipc/register-vault.ts
 *
 * 密钥库 (v2.83) — IPC 注册。明文只在主进程流转：
 *   vault:list          → 掩码条目列表 (无 value)
 *   vault:set           → 新建/更新 (加密落 Keychain-backed blob)
 *   vault:delete        → 删除
 *   vault:reveal        → 显式查看单条明文
 *   vault:copy          → 主进程写剪贴板 (30s 后自动清空)
 *   vault:export        → dialog 选位置导出明文 JSON (renderer 已二次确认)
 *   vault:import-load   → dialog 选文件解析, 预览只回掩码; 明文缓存在主进程
 *   vault:import-apply  → 凭 importId 从主进程缓存合并 (upsert)
 *
 * 附: 注册时挂过期提醒轮询 (启动 30s 后一次, 每 6h 复查, 条目级 24h 去重)。
 *
 * 2026-08 v2.83: 新增。
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

import {
  listEntries,
  setEntry,
  deleteEntry,
  revealEntry,
  copyEntry,
} from "../vault/secret-vault";
const {
  exportVaultToFile,
  loadVaultImportFile,
  applyVaultImport,
} = require("../vault/vault-portability.ts");
const {
  checkVaultExpiry,
} = require("../vault/expiry-watch.ts");

const EXPIRY_WATCH_FIRST_DELAY_MS = 30 * 1000;
const EXPIRY_WATCH_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** 挂过期提醒轮询; timer-registry 不可用 (纯单测) 时静默跳过。 */
function startExpiryWatch(getConfig: unknown) {
  try {
    const { setManagedInterval } = require("../timer-registry.ts");
    const { makeWatchlistSendNotification } = require("../watchlist.ts");
    const send = makeWatchlistSendNotification(
      typeof getConfig === "function" ? getConfig : undefined,
    );
    setManagedInterval(
      () => {
        try {
          checkVaultExpiry(send);
        } catch {
          /* noop */
        }
      },
      EXPIRY_WATCH_FIRST_DELAY_MS,
      EXPIRY_WATCH_INTERVAL_MS,
    );
  } catch {
    /* 非 Electron main 环境 (单测) 不挂调度 */
  }
}

export function registerVaultHandlers(ctx: any, opts: any = {}) {
  const { safeHandle, getConfig } = ctx;
  if (typeof safeHandle !== "function") return;

  if (opts.expiryWatch !== false) {
    startExpiryWatch(getConfig);
  }

  safeHandle("vault:list", async () => listEntries());

  safeHandle(
    "vault:set",
    async (
      _event: unknown,
      payload: IpcChannelMap["vault:set"]["args"][0],
    ) => {
      if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "invalid_payload" };
      }
      return setEntry(payload);
    },
  );

  safeHandle(
    "vault:delete",
    async (_event: unknown, id: IpcChannelMap["vault:delete"]["args"][0]) =>
      deleteEntry(id),
  );

  safeHandle(
    "vault:reveal",
    async (_event: unknown, id: IpcChannelMap["vault:reveal"]["args"][0]) =>
      revealEntry(id),
  );

  safeHandle(
    "vault:copy",
    async (
      _event: unknown,
      id: IpcChannelMap["vault:copy"]["args"][0],
      fieldLabel: IpcChannelMap["vault:copy"]["args"][1],
    ) => copyEntry(id, fieldLabel),
  );

  safeHandle("vault:export", async () => exportVaultToFile(ctx.dialog));

  safeHandle("vault:import-load", async () => loadVaultImportFile(ctx.dialog));

  safeHandle(
    "vault:import-apply",
    async (
      _event: unknown,
      importId: IpcChannelMap["vault:import-apply"]["args"][0],
    ) => applyVaultImport(importId),
  );
}

module.exports = { registerVaultHandlers };
