/**
 * src/main/ipc/index.ts — IPC handler 注册入口 (按域拆分).
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";

const { createIpcContext } = require("./context.ts");
const { registerCoreHandlers } = require("./register-core.ts");
const { registerTrayConfigHandlers } = require("./register-tray-config.ts");
const { registerOpenUrlHandlers } = require("./register-open-url.ts");
const {
  registerRemindersRecentHandlers,
} = require("./register-reminders-recent.ts");
const { registerAiHandlers } = require("./register-ai.ts");
const { registerGithubHandlers } = require("./register-github.ts");
const { registerAiUsageHandlers } = require("./register-ai-usage.ts");
const { registerWorldcupHandlers } = require("./register-worldcup.ts");
const { registerIthomeHandlers } = require("./register-ithome.ts");
const { registerIthomeShareHandlers } = require("./register-ithome-share.ts");
const { registerFundsHandlers } = require("./register-funds.ts");
const { registerWechatHotHandlers } = require("./register-wechat-hot.ts");
const { registerAiPromptsHandlers } = require("./register-ai-prompts.ts");
const { registerUpgradeAdviceHandlers } = require("./register-upgrade-advice.ts");
const {
  registerChangelogSummaryHandlers,
} = require("./register-changelog-summary.ts");
const { registerAiFeedbackHandlers } = require("./register-ai-feedback.ts");
const { registerTokenBudgetHandlers } = require("./register-token-budget.ts");
const { registerSelfUpdateHandlers } = require("./register-self-update.ts");
const {
  registerConfigPortabilityHandlers,
} = require("./register-config-portability.ts");
const { registerStocksHandlers } = require("./register-stocks.ts");
const { registerStockDetailHandlers } = require("./register-stock-detail.ts");
const { registerStockExportHandlers } = require("./register-stock-export.ts");
const {
  registerVersionsOverviewHandlers,
} = require("./register-versions-overview.ts");
const { registerThemeHandlers } = require("./register-theme.ts");
const { registerGamesHandlers } = require("./register-games.ts");
const { registerLeaderboardHandlers } = require("./register-leaderboard.ts");

/**
 * @param {object} deps — 同原 registerIpcHandlers
 */
function registerIpcHandlers(deps: Record<string, unknown>) {
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
  registerGamesHandlers(ctx); // 游戏优惠聚合 (Steam/Epic 真实 + 主机示例兜底)
  registerLeaderboardHandlers({
    ...ctx,
    dialog: require("electron").dialog,
    BrowserWindow: require("electron").BrowserWindow,
    electronApp: require("electron").app,
  }); // AI 榜单排名 (Arena + Artificial Analysis + 兜底链 + CSV 导出)
}

module.exports = { registerIpcHandlers };
