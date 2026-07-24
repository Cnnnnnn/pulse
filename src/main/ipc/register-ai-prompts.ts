/**
 * src/main/ipc/register-ai-prompts.js
 *
 * AI prompt 模板化 IPC (A7 / A7 v2):
 *   ai-prompts:load   返 { key: { system, rules, fewShot, isDefault } }
 *   ai-prompts:save   落盘 + broadcast
 *   ai-prompts:reset  删除某 key 的用户配置 → 回默认
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const stateStore = require("../state-store.ts");
const { DEFAULT_PROMPTS, PROMPT_KEYS } = require("../../ai/prompt-registry");

function mergePromptForLoad(key: any, user: any) {
  const def = DEFAULT_PROMPTS[key];
  const u = user && user[key];
  const isDefault = !u || typeof u.system !== "string" || !u.system.trim();
  return {
    system: isDefault ? def.system : u.system,
    rules: isDefault ? def.rules : u.rules != null ? u.rules : def.rules,
    fewShot: isDefault
      ? def.fewShot || ""
      : typeof u.fewShot === "string"
        ? u.fewShot
        : "",
    isDefault,
  };
}

function registerAiPromptsHandlers(ctx: any) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("ai-prompts:load", () => {
    const user = stateStore.loadAiPrompts();
    const result: Record<string, any> = {};
    for (const key of PROMPT_KEYS) {
      result[key] = mergePromptForLoad(key, user);
    }
    return result;
  });

  safeHandle("ai-prompts:save", (_evt: any, payload: any) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      stateStore.saveAiPrompts(payload);
      if (typeof sendToRenderer === "function") {
        try {
          sendToRenderer("ai-prompts-updated", {});
        } catch {
          /* noop */
        }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });

  safeHandle("ai-prompts:reset", (_evt: any, key: any) => {
    if (!key || typeof key !== "string" || !PROMPT_KEYS.includes(key)) {
      return { ok: false, reason: "unknown_key" };
    }
    try {
      const user = { ...stateStore.loadAiPrompts() };
      delete user[key];
      stateStore.saveAiPrompts(user);
      if (typeof sendToRenderer === "function") {
        try {
          sendToRenderer("ai-prompts-updated", {});
        } catch {
          /* noop */
        }
      }
      return { ok: true, key };
    } catch (err) {
      return { ok: false, reason: "threw", error: errMsg(err) };
    }
  });
}

module.exports = { registerAiPromptsHandlers };
