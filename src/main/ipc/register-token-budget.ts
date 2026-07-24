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

const stateStore = require("../state-store.ts");
const { todayKey } = require("../token-budget.ts");

function registerTokenBudgetHandlers(ctx) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("token-budget:get", async () => {
    try {
      const config = stateStore.loadTokenBudgetConfig();
      const spend = stateStore.loadTokenSpend();
      return { ok: true, config, todaySpend: spend[todayKey()] || 0 };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("token-budget:set", async (_evt, cfg) => {
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
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerTokenBudgetHandlers };
