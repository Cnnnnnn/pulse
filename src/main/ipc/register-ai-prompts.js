/**
 * src/main/ipc/register-ai-prompts.js
 *
 * AI prompt 模板化 IPC (A7):
 *   ai-prompts:load   返 { key: { system, rules, isDefault } } (合并默认+用户)
 *   ai-prompts:save   落盘 + broadcast ai-prompts-updated
 */

const stateStore = require("../state-store");
const { DEFAULT_PROMPTS, PROMPT_KEYS } = require("../../ai/prompt-registry");

function registerAiPromptsHandlers(ctx) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("ai-prompts:load", () => {
    const user = stateStore.loadAiPrompts();
    const result = {};
    for (const key of PROMPT_KEYS) {
      const def = DEFAULT_PROMPTS[key];
      const u = user && user[key];
      const isDefault =
        !u ||
        typeof u.system !== "string" ||
        !u.system.trim();
      result[key] = {
        system: isDefault ? def.system : u.system,
        rules: isDefault ? def.rules : (u.rules != null ? u.rules : def.rules),
        isDefault,
      };
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
        try { sendToRenderer("ai-prompts-updated", {}); } catch { /* noop */ }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerAiPromptsHandlers };
