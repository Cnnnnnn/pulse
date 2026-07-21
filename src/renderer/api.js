/**
 * src/renderer/api.js
 *
 * window.api包装层。preload.js 通过 contextBridge暴露：
 * getConfig / checkUpdates / brewUpgrade / brewUpdate /
 * getAppIcon / onCheckProgress / onStartCheck /
 * bulkUpgradeStart / bulkUpgradeCancel / onBulkUpgradeProgress / onBulkUpgradeDone
 * (Phase22 bulk upgrade 新增)
 * openUrl — universal "open URL in system browser" bridge (v2.24+).
 *
 * 这里包一层：
 * - 默认从 window.api 取值（生产路径）
 * - 测试时可注入 mock (overrides)
 * - 提供一个 clean trigger() helper 给 bootstrap 用
 */

const noop = () => {};

// 缺 IPC bridge 时在 dev 模式一次性 warn — 2026-06-28 「检查更新」按钮无反应
// 根因是 preload 漏暴露 versionsRunCheck, 而 pick() 静默 fallback 到 noop 让人
// 排查两小时. 现在同一进程同一 key 只 warn 一次, 生产无副作用.
const IS_DEV =
  typeof process !== "undefined" &&
  process.env &&
  process.env.NODE_ENV !== "production";
const warnedMissing = new Set();

function pick(overrides, name) {
  if (overrides && name in overrides) return overrides[name];
  if (typeof window !== "undefined" && window.api && window.api[name]) {
    return window.api[name];
  }
  if (IS_DEV && !warnedMissing.has(name)) {
    warnedMissing.add(name);
     
    console.warn(
      `[api] IPC bridge "${name}" missing — preload.js 未暴露或 window.api 未注入, ` +
        `fallback noop. 检查 preload.js contextBridge.exposeInMainWorld("api", { ... }).`,
    );
  }
  //兜底 (测试或非 Electron 环境)
  return noop;
}

export function createApi(overrides = {}) {
  return {
    getConfig: pick(overrides, "getConfig"),
    getCachedState: pick(overrides, "getCachedState"),
    searchQuery: pick(overrides, "searchQuery"),
    searchUpsert: pick(overrides, "searchUpsert"),
    checkUpdates: pick(overrides, "checkUpdates"),
    brewUpgrade: pick(overrides, "brewUpgrade"),
    brewUpdate: pick(overrides, "brewUpdate"),
    getAppIcon: pick(overrides, "getAppIcon"),
    onCheckProgress: pick(overrides, "onCheckProgress"),
    onCheckDetecting: pick(overrides, "onCheckDetecting"),
    onStartCheck: pick(overrides, "onStartCheck"),
    onAutoCheckFinished: pick(overrides, "onAutoCheckFinished"),
    onCheckFinished: pick(overrides, "onCheckFinished"),
    // Phase22: Bulk Upgrade
    bulkUpgradeStart: pick(overrides, "bulkUpgradeStart"),
    bulkUpgradeCancel: pick(overrides, "bulkUpgradeCancel"),
    onBulkUpgradeProgress: pick(overrides, "onBulkUpgradeProgress"),
    onBulkUpgradeDone: pick(overrides, "onBulkUpgradeDone"),
    // Phase27: Mutes (per-app静音)
    getMutes: pick(overrides, "getMutes"),
    setMute: pick(overrides, "setMute"),
    clearMute: pick(overrides, "clearMute"),
    // Phase29: Last-opened (per-app 最近打开)
    getLastOpened: pick(overrides, "getLastOpened"),
    refreshLastOpened: pick(overrides, "refreshLastOpened"),
    onLastOpenedUpdated: pick(overrides, "onLastOpenedUpdated"),
    // Phase A (App Categorization): active category tab
    getActiveCategory: pick(overrides, "getActiveCategory"),
    saveActiveCategory: pick(overrides, "saveActiveCategory"),
    // AI 任务总结 (重做版)
    listAiTasks: pick(overrides, "listAiTasks"),
    summarizeAiTasks: pick(overrides, "summarizeAiTasks"),
    onAiTaskSummaryUpdated: pick(overrides, "onAiTaskSummaryUpdated"),
    // 跳到原始 session
    openSession: pick(overrides, "openSession"),
    // Phase B6c (AI Sessions Settings)
    setAiKey: pick(overrides, "setAiKey"),
    clearAiKey: pick(overrides, "clearAiKey"),
    hasAiKey: pick(overrides, "hasAiKey"),
    aiHealthcheck: pick(overrides, "aiHealthcheck"),
    getAiSessionsConfig: pick(overrides, "getAiSessionsConfig"),
    saveAiSessionsConfig: pick(overrides, "saveAiSessionsConfig"),
    onAiSessionsConfigUpdated: pick(overrides, "onAiSessionsConfigUpdated"),
    // v2.9.0 世界杯专栏
    worldcupFetchFixtures: pick(overrides, "worldcupFetchFixtures"),
    worldcupLoadScores: pick(overrides, "worldcupLoadScores"),
    worldcupRefreshScores: pick(overrides, "worldcupRefreshScores"),
    worldcupLoadInsights: pick(overrides, "worldcupLoadInsights"),
    worldcupGenerateInsight: pick(overrides, "worldcupGenerateInsight"),
    // v2.10.0 世界杯体彩记账
    worldcupLoadBets: pick(overrides, "worldcupLoadBets"),
    worldcupUpsertBet: pick(overrides, "worldcupUpsertBet"),
    worldcupRemoveBet: pick(overrides, "worldcupRemoveBet"),
    getAiSharedConfig: pick(overrides, "getAiSharedConfig"),
    // v2.10+ 基金管理
    fundsList: pick(overrides, "fundsList"),
    fundsAdd: pick(overrides, "fundsAdd"),
    fundsUpdate: pick(overrides, "fundsUpdate"),
    fundsRemove: pick(overrides, "fundsRemove"),
    fundsRestore: pick(overrides, "fundsRestore"),
    fundsSearch: pick(overrides, "fundsSearch"),
    fundsBackfill: pick(overrides, "fundsBackfill"),
    fundsNavFetch: pick(overrides, "fundsNavFetch"),
    fundsNavFetchCodes: pick(overrides, "fundsNavFetchCodes"),
    fundsNavState: pick(overrides, "fundsNavState"),
    fundsHistoryList: pick(overrides, "fundsHistoryList"),
    fundsNavHistory: pick(overrides, "fundsNavHistory"),
    fundsIndexHistory: pick(overrides, "fundsIndexHistory"),
    fundsSetNavSource: pick(overrides, "fundsSetNavSource"),
    fundsAlertPrefsGet: pick(overrides, "fundsAlertPrefsGet"),
    fundsAlertPrefsSet: pick(overrides, "fundsAlertPrefsSet"),
    onFundsNavFetched: pick(overrides, "onFundsNavFetched"),
    onFundsNavState: pick(overrides, "onFundsNavState"),
    onFundsHistoryUpdated: pick(overrides, "onFundsHistoryUpdated"),
    // v2.11 提醒
    remindersList: pick(overrides, "remindersList"),
    remindersCreate: pick(overrides, "remindersCreate"),
    remindersUpdate: pick(overrides, "remindersUpdate"),
    remindersRemove: pick(overrides, "remindersRemove"),
    remindersMarkDone: pick(overrides, "remindersMarkDone"),
    remindersMarkDismissed: pick(overrides, "remindersMarkDismissed"),
    onRemindersFired: pick(overrides, "onRemindersFired"),
    onRemindersOpenModal: pick(overrides, "onRemindersOpenModal"),
    // v2.11 时间线
    recentList: pick(overrides, "recentList"),
    recentPush: pick(overrides, "recentPush"),
    onRecentUpdated: pick(overrides, "onRecentUpdated"),
    // v2.12 主进程未捕获错误兜底
    onMainError: pick(overrides, "onMainError"),
    // Universal "open URL in system browser" bridge (validates http/https in main).
    openUrl: pick(overrides, "openUrl"),
    // 微博热搜 (v2.24.1, 原微信热搜 v2.24.0)
    wechatHotLoad: pick(overrides, "wechatHotLoad"),
    wechatHotRefresh: pick(overrides, "wechatHotRefresh"),
    onWechatHotUpdated: pick(overrides, "onWechatHotUpdated"),
    // v2.13 AI 用量 (Minimax coding plan)
    aiUsageGetCached: pick(overrides, "aiUsageGetCached"),
    aiUsageFetch: pick(overrides, "aiUsageFetch"),
    aiUsageAlertPrefsGet: pick(overrides, "aiUsageAlertPrefsGet"),
    aiUsageAlertPrefsSet: pick(overrides, "aiUsageAlertPrefsSet"),
    onAiUsageUpdated: pick(overrides, "onAiUsageUpdated"),
    onSidenavBadge: pick(overrides, "onSidenavBadge"),
    // Phase Q8: state.json corruption self-recovery banner
    onStateRecovered: pick(overrides, "onStateRecovered"),
    // Phase I5: daily digest
    digestFetchSections: pick(overrides, "digestFetchSections"),
    digestUpdateSettings: pick(overrides, "digestUpdateSettings"),
    onDigestOpen: pick(overrides, "onDigestOpen"),
    // Phase Q6: error aggregator
    errorFetchEntries: pick(overrides, "errorFetchEntries"),
    errorCopyAll: pick(overrides, "errorCopyAll"),
    errorExportZip: pick(overrides, "errorExportZip"),
    errorClearOld: pick(overrides, "errorClearOld"),
    // Phase Q1 v2: diagnostics drawer
    diagnosticsFetch: pick(overrides, "diagnosticsFetch"),
    diagnosticsFetchSamples: pick(overrides, "diagnosticsFetchSamples"),
    // C7 v2.35.0: 检测结果导出
    detectResultsExport: pick(overrides, "detectResultsExport"),
    // I2 v1: watchlist (pinned apps)
    watchlistList: pick(overrides, "watchlistList"),
    watchlistAdd: pick(overrides, "watchlistAdd"),
    watchlistRemove: pick(overrides, "watchlistRemove"),
    errorOpenFolder: pick(overrides, "errorOpenFolder"),
    errorReport: pick(overrides, "errorReport"),
    onErrorAppended: pick(overrides, "onErrorAppended"),
    // Win 窗口控件 (renderer 画的 min/max/close 按钮调这里).
    // 在 mac 上虽然也调, 但 renderer 这边只在 body.platform-win 渲染按钮,
    // 不会触达. 兜底函数保 noop 避免 undefined crash.
    windowMinimize: pick(overrides, "windowMinimize"),
    windowToggleMaximize: pick(overrides, "windowToggleMaximize"),
    windowClose: pick(overrides, "windowClose"),
    // P52: 自更新 (半自动档)
    selfUpdateGetState: pick(overrides, "selfUpdateGetState"),
    selfUpdateCheck: pick(overrides, "selfUpdateCheck"),
    selfUpdateInstall: pick(overrides, "selfUpdateInstall"),
    // ON: release notes onboarding (nested, 跟 spec §3.4 + preload 一致).
    // preload 暴露 window.api.releaseNotes = { getCurrent, getVersion, markSeen },
    // 这里从 window.api.releaseNotes 整块取; 测试 overrides 时传 releaseNotes 子对象.
    releaseNotes: (overrides && overrides.releaseNotes) ||
      (typeof window !== "undefined" &&
        window.api &&
        window.api.releaseNotes) || {
        getCurrent: noop,
        getVersion: noop,
        markSeen: noop,
      },
    // A7: AI prompt 模板化
    aiPromptsLoad: pick(overrides, "aiPromptsLoad"),
    aiPromptsSave: pick(overrides, "aiPromptsSave"),
    aiPromptsReset: pick(overrides, "aiPromptsReset"),
    upgradeAdviceFetch: pick(overrides, "upgradeAdviceFetch"),
    changelogSummaryFetch: pick(overrides, "changelogSummaryFetch"),
    feedbackRecord: pick(overrides, "feedbackRecord"),
    feedbackExport: pick(overrides, "feedbackExport"),
    tokenBudgetGet: pick(overrides, "tokenBudgetGet"),
    tokenBudgetSet: pick(overrides, "tokenBudgetSet"),
    configExport: pick(overrides, "configExport"),
    configImportLoad: pick(overrides, "configImportLoad"),
    configImportApply: pick(overrides, "configImportApply"),
    onAiPromptsUpdated: pick(overrides, "onAiPromptsUpdated"),
    // 选股分析 (阶段一): 筛选 + 搜索
    stocksScreen: pick(overrides, "stocksScreen"),
    stocksSearch: pick(overrides, "stocksSearch"),
    // 阶段二: AI 推荐筛选条件
    stocksAiAdvise: pick(overrides, "stocksAiAdvise"),
    // 阶段三: 个股多角度分析 + AI 详情
    stocksDetailAngles: pick(overrides, "stocksDetailAngles"),
    stocksDetailAnalyze: pick(overrides, "stocksDetailAnalyze"),
    // ponytail: 2026-07-07 P1-2 — 单条 angle 本地重解读
    stocksAngleRefresh: pick(overrides, "stocksAngleRefresh"),
    // 2026-07-07 — 诊断报告导出 PNG (主进程 capturePage + showSaveDialog)
    stocksExportDiagnosisPng: pick(overrides, "stocksExportDiagnosisPng"),
    // Cmd+K command palette 全局搜索
    versionsCommandSearch: pick(overrides, "versionsCommandSearch"),
    // v2.50 (T5): LibraryPage / OverviewEmptyState CTA 触发检查
    versionsRunCheck: pick(overrides, "versionsRunCheck"),
    // v2.80 GitHub 优秀项目收录
    githubFetch: pick(overrides, "githubFetch"),
    aiParseReadme: pick(overrides, "aiParseReadme"),
    // Release 更新追踪：抓取某仓库 recent releases
    githubFetchRelease: pick(overrides, "githubFetchRelease"),
    // 游戏优惠聚合 (v2.81): 各平台折扣 / 免费活动 / 热门榜
    getGameDeals: pick(overrides, "getGameDeals"),
    getSteamLowest: pick(overrides, "getSteamLowest"),
    getItadLowest: pick(overrides, "getItadLowest"),
    getFx: pick(overrides, "getFx"),
  // AI 榜单排名模块 (v2.82): 仅两个白名单通道
  getLeaderboard: pick(overrides, "getLeaderboard"),
  refreshLeaderboard: pick(overrides, "refreshLeaderboard"),
  rateBudget: pick(overrides, "rateBudget"),
  };
}

/** 默认实例：绑定到 window.api (生产) */
export const api = createApi();
