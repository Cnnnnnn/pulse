/**
 * src/main/ipc/index.js — IPC handler 注册入口 (按域拆分).
 */

const { createIpcContext } = require("./context");
const { registerCoreHandlers } = require("./register-core");
const { registerRemindersRecentHandlers } = require("./register-reminders-recent");
const { registerAiHandlers } = require("./register-ai");
const { registerWorldcupHandlers } = require("./register-worldcup");
const { registerIthomeHandlers } = require("./register-ithome");
const { registerFundsHandlers } = require("./register-funds");

/**
 * @param {object} deps — 同原 registerIpcHandlers
 */
function registerIpcHandlers(deps) {
  const ctx = createIpcContext(deps);
  registerCoreHandlers(ctx);
  registerRemindersRecentHandlers(ctx);
  registerAiHandlers(ctx);
  registerWorldcupHandlers(ctx);
  registerIthomeHandlers(ctx);
  registerFundsHandlers(ctx);
}

module.exports = { registerIpcHandlers };
