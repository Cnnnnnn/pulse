/**
 * src/main/ipc/index.js — IPC handler 注册入口 (按域拆分).
 */

const { createIpcContext } = require("./context");
const { registerCoreHandlers } = require("./register-core");
const { registerRemindersRecentHandlers } = require("./register-reminders-recent");
const { registerAiHandlers } = require("./register-ai");
const { registerAiUsageHandlers } = require("./register-ai-usage");
const { registerWorldcupHandlers } = require("./register-worldcup");
const { registerIthomeHandlers } = require("./register-ithome");
const { registerIthomeShareHandlers } = require("./register-ithome-share");
const { registerFundsHandlers } = require("./register-funds");
const { registerWechatHotHandlers } = require("./register-wechat-hot");

/**
 * @param {object} deps — 同原 registerIpcHandlers
 */
function registerIpcHandlers(deps) {
  const ctx = createIpcContext(deps);
  registerCoreHandlers(ctx);
  registerRemindersRecentHandlers(ctx);
  registerAiHandlers(ctx);
  registerAiUsageHandlers(ctx);
  registerWorldcupHandlers(ctx);
  registerIthomeHandlers(ctx);
  registerIthomeShareHandlers(ctx);
  registerFundsHandlers(ctx);
  registerWechatHotHandlers(ctx); // ← 新增
}

module.exports = { registerIpcHandlers };
