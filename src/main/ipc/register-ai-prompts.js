/**
 * src/main/ipc/register-ai-prompts.js
 *
 * AI prompt 模板化 IPC (A7 / A7 v2):
 *   ai-prompts:load   返 { key: { system, rules, fewShot, isDefault } }
 *   ai-prompts:save   落盘 + broadcast
 *   ai-prompts:reset  删除某 key 的用户配置 → 回默认
 */

const stateStore = require("../state-store");
const { DEFAULT_PROMPTS, PROMPT_KEYS } = require("../../ai/prompt-registry");

function mergePromptForLoad(key, user) {
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

function registerAiPromptsHandlers(ctx) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("ai-prompts:load", () => {
    const user = stateStore.loadAiPrompts();
    const result = {};
    for (const key of PROMPT_KEYS) {
      result[key] = mergePromptForLoad(key, user);
    }
    return result;
  });

  safeHandle("ai-prompts:save", (_evt, payload) => {
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
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("ai-prompts:reset", (_evt, key) => {
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
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerAiPromptsHandlers };
