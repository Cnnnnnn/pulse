/**
 * src/main/ipc/index.js — IPC handler 注册入口 (按域拆分).
 */

const { createIpcContext } = require("./context");
const { registerCoreHandlers } = require("./register-core");
const { registerTrayConfigHandlers } = require("./register-tray-config");
const { registerOpenUrlHandlers } = require("./register-open-url");
const {
  registerRemindersRecentHandlers,
} = require("./register-reminders-recent");
const { registerAiHandlers } = require("./register-ai");
const { registerGithubHandlers } = require("./register-github");
const { registerAiUsageHandlers } = require("./register-ai-usage");
const { registerWorldcupHandlers } = require("./register-worldcup");
const { registerIthomeHandlers } = require("./register-ithome");
const { registerIthomeShareHandlers } = require("./register-ithome-share");
const { registerFundsHandlers } = require("./register-funds");
const { registerWechatHotHandlers } = require("./register-wechat-hot");
const { registerAiPromptsHandlers } = require("./register-ai-prompts");
const { registerUpgradeAdviceHandlers } = require("./register-upgrade-advice");
const {
  registerChangelogSummaryHandlers,
} = require("./register-changelog-summary");
const { registerAiFeedbackHandlers } = require("./register-ai-feedback");
const { registerTokenBudgetHandlers } = require("./register-token-budget");
const { registerSelfUpdateHandlers } = require("./register-self-update");
const {
  registerConfigPortabilityHandlers,
} = require("./register-config-portability");
const { registerStocksHandlers } = require("./register-stocks");
const { registerStockDetailHandlers } = require("./register-stock-detail");
const { registerStockExportHandlers } = require("./register-stock-export");
const {
  registerVersionsOverviewHandlers,
} = require("./register-versions-overview");
const { registerThemeHandlers } = require("./register-theme");

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
  registerGithubHandlers(ctx); // v2.80 GitHub 优秀项目收录
  registerAiUsageHandlers(ctx);
  registerWorldcupHandlers(ctx);
  registerIthomeHandlers(ctx);
  registerIthomeShareHandlers(ctx);
  registerFundsHandlers(ctx);
  registerWechatHotHandlers(ctx); // ← 新增
  registerAiPromptsHandlers(ctx); // A7: AI prompt 模板化
  registerUpgradeAdviceHandlers(ctx); // A2: 升级建议
  registerChangelogSummaryHandlers(ctx); // A1: changelog 摘要
  registerAiFeedbackHandlers(ctx); // A8: AI 反馈闭环
  registerTokenBudgetHandlers(ctx); // P71: token 预算
  registerConfigPortabilityHandlers({
    ...ctx,
    dialog: require("electron").dialog,
  }); // P61: 配置导入导出 (首次引入 electron dialog)
  registerSelfUpdateHandlers({
    ...ctx,
    controller: ctx.selfUpdateController ? ctx.selfUpdateController() : null,
  }); // P52: 自更新 IPC (controller 由 bootstrap 注入, 未注入则不注册任何 handler)
  registerStocksHandlers(ctx); // 股票筛选器 (选股分析阶段一)
  registerStockDetailHandlers(ctx); // 个股 AI 分析 (选股分析阶段四)
  registerStockExportHandlers({
    ...ctx,
    dialog: require("electron").dialog,
    BrowserWindow: require("electron").BrowserWindow,
    electronApp: require("electron").app,
  }); // 诊断报告导出 PNG (需要 dialog + BrowserWindow + app.getPath)
  registerVersionsOverviewHandlers(ctx); // Task 15: overview 5 数据源 + command palette
  registerThemeHandlers(ctx); // P10: 主进程 ↔ renderer 主题桥接 (托盘切换 + system 同步)
}

module.exports = { registerIpcHandlers };
