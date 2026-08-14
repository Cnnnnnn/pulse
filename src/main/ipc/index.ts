/**
 * src/main/ipc/index.ts — IPC handler 注册入口 (按域拆分).
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";

import { createIpcContext } from "./context";
import { registerCoreHandlers } from "./register-core";
import { registerTrayConfigHandlers } from "./register-tray-config";
import { registerOpenUrlHandlers } from "./register-open-url";
const {
  registerRemindersRecentHandlers,
} = require("./register-reminders-recent.ts");
import { registerAiHandlers } from "./register-ai";
import { registerGithubHandlers } from "./register-github";
import { registerAiUsageHandlers } from "./register-ai-usage";
import { registerIthomeHandlers } from "./register-ithome";
import { registerIthomeShareHandlers } from "./register-ithome-share";
import { registerFundsHandlers } from "./register-funds";
import { registerWechatHotHandlers } from "./register-wechat-hot";
import { registerAiPromptsHandlers } from "./register-ai-prompts";
import { registerUpgradeAdviceHandlers } from "./register-upgrade-advice";
const {
  registerChangelogSummaryHandlers,
} = require("./register-changelog-summary.ts");
import { registerAiFeedbackHandlers } from "./register-ai-feedback";
import { registerTokenBudgetHandlers } from "./register-token-budget";
import { registerSelfUpdateHandlers } from "./register-self-update";
const {
  registerConfigPortabilityHandlers,
} = require("./register-config-portability.ts");
import { registerStocksHandlers } from "./register-stocks";
import { registerStockDetailHandlers } from "./register-stock-detail";
import { registerStockExportHandlers } from "./register-stock-export";
const {
  registerVersionsOverviewHandlers,
} = require("./register-versions-overview.ts");
import { registerThemeHandlers } from "./register-theme";
import { registerLeaderboardHandlers } from "./register-leaderboard";
import { registerFinanceHandlers } from "./register-finance";

/**
 * @param {object} deps — 同原 registerIpcHandlers
 */
export function registerIpcHandlers(deps: Record<string, unknown>) {
  const ctx = createIpcContext(deps);
  registerCoreHandlers(ctx);
  registerTrayConfigHandlers(ctx); // Phase v1: tray 菜单配置
  registerOpenUrlHandlers(ctx);
  registerRemindersRecentHandlers(ctx);
  registerAiHandlers(ctx);
  registerGithubHandlers(ctx); // v2.80 GitHub 优秀项目收录
  registerAiUsageHandlers(ctx);
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
  registerLeaderboardHandlers({
    ...ctx,
    dialog: require("electron").dialog,
    BrowserWindow: require("electron").BrowserWindow,
    electronApp: require("electron").app,
  }); // AI 榜单排名 (Arena + Artificial Analysis + 兜底链 + CSV 导出)
  registerFinanceHandlers(ctx); // 财经新闻 + 行情（P0）
}

module.exports = { registerIpcHandlers };
