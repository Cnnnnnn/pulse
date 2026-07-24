/**
 * src/main/ipc/register-self-update.js
 *
 * P52 — 自更新 IPC.
 * controller 由 bootstrap (startSelfUpdateTimer) 注入, 持有 autoUpdater + 状态机.
 *
 * 通道:
 *   self-update:get-state  → { ok, state }
 *   self-update:check      → { ok, reason? }
 *   self-update:install    → { ok }  // quitAndInstall
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";

// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function registerSelfUpdateHandlers(ctx: any) {
  const { safeHandle, controller } = ctx || {};
  if (typeof safeHandle !== "function") return;
  if (!controller) {
    // 自更新未启用 (electron-updater 未装) → 不注册任何 handler,
    // renderer 端 selfUpdateGetState 返 undefined, UI 自然 fallback 到 "不可用"
    return;
  }

  safeHandle("self-update:get-state", async () => {
    if (typeof controller.getState !== "function") {
      return { ok: false, reason: "not-implemented" };
    }
    try {
      return { ok: true, state: controller.getState() };
    } catch (err) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });

  safeHandle("self-update:check", async () => {
    if (typeof controller.checkNow !== "function") {
      return { ok: false, reason: "not-implemented" };
    }
    try {
      const r = await controller.checkNow();
      return r || { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });

  safeHandle("self-update:install", async () => {
    if (typeof controller.quitAndInstall !== "function") {
      return { ok: false, reason: "not-implemented" };
    }
    try {
      controller.quitAndInstall();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });
}

module.exports = { registerSelfUpdateHandlers };
