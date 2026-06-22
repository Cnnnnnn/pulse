/**
 * src/main/ipc/index.js — IPC handler 注册入口 (按域拆分).
 */

const { createIpcContext } = require("./context");
const { registerCoreHandlers } = require("./register-core");
const { registerTrayConfigHandlers } = require("./register-tray-config");
const { registerOpenUrlHandlers } = require("./register-open-url");
const { registerRemindersRecentHandlers } = require("./register-reminders-recent");
const { registerAiHandlers } = require("./register-ai");
const { registerAiUsageHandlers } = require("./register-ai-usage");
const { registerWorldcupHandlers } = require("./register-worldcup");
const { registerIthomeHandlers } = require("./register-ithome");
const { registerIthomeShareHandlers } = require("./register-ithome-share");
const { registerFundsHandlers } = require("./register-funds");
const { registerWechatHotHandlers } = require("./register-wechat-hot");
const { registerFoodHandlers } = require("./register-food");

/**
 * @param {object} deps — 同原 registerIpcHandlers
 */
function registerIpcHandlers(deps) {
  const ctx = createIpcContext(deps);
  registerCoreHandlers(ctx);
  registerTrayConfigHandlers(ctx); // Phase v1: tray 菜单配置
  registerOpenUrlHandlers(ctx);
  registerRemindersRecentHandlers(ctx);
  registerAiHandlers(ctx);
  registerAiUsageHandlers(ctx);
  registerWorldcupHandlers(ctx);
  registerIthomeHandlers(ctx);
  registerIthomeShareHandlers(ctx);
  registerFundsHandlers(ctx);
  registerWechatHotHandlers(ctx); // ← 新增
  registerFoodHandlers(ctx);
}

module.exports = { registerIpcHandlers };
