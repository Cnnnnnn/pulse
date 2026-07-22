import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type { Callback, PlatformInfo } from "./src/shared/preload-types";

export const platformInfo: PlatformInfo = {
  platform: process.platform,
};

export const api = {
  getConfig: () => ipcRenderer.invoke("get-config"),
  getCachedState: () => ipcRenderer.invoke("get-cached-state"),
  searchQuery: (q: string, source: string) =>
    ipcRenderer.invoke("search:query", { q, source }),
  searchUpsert: (doc: unknown) => ipcRenderer.invoke("search:upsert", doc),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  brewUpgrade: (cask: string) => ipcRenderer.invoke("brew-upgrade", cask),
  brewUpdate: () => ipcRenderer.invoke("brew-update"),
  getAppIcon: (b: string) => ipcRenderer.invoke("get-app-icon", b),

  onCheckProgress: (cb: Callback) =>
    ipcRenderer.on("check-progress", (_, data) => cb(data)),
  onCheckDetecting: (cb: Callback) =>
    ipcRenderer.on("check-detecting", (_, data) => cb(data)),
  onStartCheck: (cb: () => void) => ipcRenderer.on("start-check", () => cb()),
  onAutoCheckFinished: (cb: Callback) =>
    ipcRenderer.on("auto-check-finished", (_, data) => cb(data)),
  onCheckFinished: (cb: Callback) =>
    ipcRenderer.on("check-finished", (_, data) => cb(data)),
  // v2.22: 菜单栏点击更新行 → renderer 接收定位指令
  onTrayFocus: (cb: Callback) =>
    ipcRenderer.on("tray:focus", (_, data) => cb(data)),

  // Bulk Upgrade (Phase22)
  bulkUpgradeStart: (items: unknown) =>
    ipcRenderer.invoke("bulk-upgrade:start", items),
  bulkUpgradeCancel: () => ipcRenderer.invoke("bulk-upgrade:cancel"),
  onBulkUpgradeProgress: (cb: Callback) =>
    ipcRenderer.on("bulk-upgrade:progress", (_, data) => cb(data)),
  onBulkUpgradeDone: (cb: Callback) =>
    ipcRenderer.on("bulk-upgrade:done", (_, data) => cb(data)),

  // Phase27: Mutes (per-app静音)
  getMutes: () => ipcRenderer.invoke("get-mutes"),
  setMute: (name: string, durationSec: number) =>
    ipcRenderer.invoke("set-mute", name, durationSec),
  clearMute: (name: string) => ipcRenderer.invoke("clear-mute", name),

  // Phase29: Last-opened (per-app 最近打开)
  getLastOpened: () => ipcRenderer.invoke("get-last-opened"),
  refreshLastOpened: () => ipcRenderer.invoke("refresh-last-opened"),
  onLastOpenedUpdated: (cb: Callback) =>
    ipcRenderer.on("last-opened-updated", (_, data) => cb(data)),

  // Phase A (App Categorization): active category tab
  getActiveCategory: () => ipcRenderer.invoke("get-active-category"),
  saveActiveCategory: (id: string) => ipcRenderer.invoke("save-active-category", id),

  // P-N: HomeGrid 落点
  getLastActiveNav: () => ipcRenderer.invoke("get-last-active-nav"),
  saveLastActiveNav: (key: string) => ipcRenderer.invoke("save-last-active-nav", key),

  // AI 任务总结 (重做版): 按需扫描 + 按需生成
  listAiTasks: (opts: unknown) => ipcRenderer.invoke("ai-tasks:list", opts),
  summarizeAiTasks: (opts: unknown) =>
    ipcRenderer.invoke("ai-tasks:summarize", opts),
  onAiTaskSummaryUpdated: (cb: Callback) =>
    ipcRenderer.on("ai-task-summary-updated", (_, data) => cb(data)),
  // 跳到原始 session (任务卡 "查看原始" 用)
  openSession: (target: unknown) =>
    ipcRenderer.invoke("ai-sessions:open-session", target),

  // Phase B6c (AI Sessions Settings): safeStorage API key + config
  setAiKey: (providerId: string, apiKey: string) =>
    ipcRenderer.invoke("ai-sessions:set-key", providerId, apiKey),
  clearAiKey: (providerId: string) =>
    ipcRenderer.invoke("ai-sessions:clear-key", providerId),
  hasAiKey: (providerId: string) =>
    ipcRenderer.invoke("ai-sessions:has-key", providerId),
  aiHealthcheck: (opts: unknown) => ipcRenderer.invoke("ai-sessions:healthcheck", opts),
  getAiSessionsConfig: () => ipcRenderer.invoke("ai-sessions:get-config"),
  saveAiSessionsConfig: (cfg: unknown) =>
    ipcRenderer.invoke("ai-sessions:save-config", cfg),
  onAiSessionsConfigUpdated: (cb: Callback) =>
    ipcRenderer.on("ai-sessions-config-updated", (_, data) => cb(data)),

  // A7: AI prompt 模板化
  aiPromptsLoad: () => ipcRenderer.invoke("ai-prompts:load"),
  aiPromptsSave: (prompts: unknown) => ipcRenderer.invoke("ai-prompts:save", prompts),
  aiPromptsReset: (key: string) => ipcRenderer.invoke("ai-prompts:reset", key),
  upgradeAdviceFetch: (opts: unknown) =>
    ipcRenderer.invoke("upgrade-advice:fetch", opts),
  changelogSummaryFetch: (opts: unknown) =>
    ipcRenderer.invoke("changelog-summary:fetch", opts),
  feedbackRecord: (payload: unknown) => ipcRenderer.invoke("feedback:record", payload),
  feedbackExport: () => ipcRenderer.invoke("feedback:export"),
  tokenBudgetGet: () => ipcRenderer.invoke("token-budget:get"),
  tokenBudgetSet: (payload: unknown) => ipcRenderer.invoke("token-budget:set", payload),
  configExport: (pulseVersion: string) =>
    ipcRenderer.invoke("config:export", pulseVersion),
  configImportLoad: () => ipcRenderer.invoke("config:import-load"),
  configImportApply: (payload: unknown) =>
    ipcRenderer.invoke("config:import-apply", payload),
  onAiPromptsUpdated: (cb: () => void) => {
    const handler = (_evt: IpcRendererEvent) => cb();
    ipcRenderer.on("ai-prompts-updated", handler);
    return () => ipcRenderer.removeListener("ai-prompts-updated", handler);
  },

  // v2.13 AI 用量 (Minimax coding plan)
  aiUsageGetCached: () => ipcRenderer.invoke("ai-usage:get-cached"),
  aiUsageFetch: (opts: unknown) => ipcRenderer.invoke("ai-usage:fetch", opts),
  aiUsageAlertPrefsGet: () => ipcRenderer.invoke("ai-usage:alert-prefs:get"),
  aiUsageAlertPrefsSet: (patch: unknown) =>
    ipcRenderer.invoke("ai-usage:alert-prefs:set", patch),
  onAiUsageUpdated: (cb: Callback) =>
    ipcRenderer.on("ai-usage-updated", (_, data) => cb(data)),
  onSidenavBadge: (cb: Callback) =>
    ipcRenderer.on("sidenav:badge", (_, data) => cb(data)),

  // Phase Q8: state.json corruption self-recovery banner
  onStateRecovered: (cb: Callback) =>
    ipcRenderer.on("state:recovered", (_, data) => cb(data)),

  // Phase I5: daily digest
  digestFetchSections: () => ipcRenderer.invoke("digest:fetch-sections"),
  digestUpdateSettings: (cfg: unknown) =>
    ipcRenderer.invoke("digest:update-settings", cfg),
  onDigestOpen: (cb: Callback) =>
    ipcRenderer.on("digest:open", (_, data) => cb(data)),

  // Phase Q6: error aggregator
  errorFetchEntries: (opts: unknown) =>
    ipcRenderer.invoke("error:fetch-entries", opts),
  errorCopyAll: () => ipcRenderer.invoke("error:copy-all"),
  errorExportZip: (opts: unknown) => ipcRenderer.invoke("error:export-zip", opts),
  errorClearOld: (opts: unknown) => ipcRenderer.invoke("error:clear-old", opts),
  // Phase Q1 v2: diagnostics drawer
  diagnosticsFetch: (opts: unknown) => ipcRenderer.invoke("diagnostics:fetch", opts),
  diagnosticsFetchSamples: () =>
    ipcRenderer.invoke("diagnostics:fetch-samples"),
  // C7 v2.35.0: 检测结果导出
  detectResultsExport: (opts: unknown) =>
    ipcRenderer.invoke("detect-results:export", opts),
  // I2 v1: watchlist (pinned apps)
  watchlistList: () => ipcRenderer.invoke("watchlist:list"),
  watchlistAdd: (payload: string | unknown) =>
    ipcRenderer.invoke(
      "watchlist:add",
      typeof payload === "string" ? { appName: payload } : payload,
    ),
  watchlistRemove: (payload: string | unknown) =>
    ipcRenderer.invoke(
      "watchlist:remove",
      typeof payload === "string" ? { appName: payload } : payload,
    ),
  // ON: release notes onboarding (nested form, 跟 spec §3.4 一致)
  releaseNotes: {
    getCurrent: () => ipcRenderer.invoke("release-notes:get-current"),
    getVersion: (version: string) =>
      ipcRenderer.invoke("release-notes:get-version", version),
    markSeen: (version: string) =>
      ipcRenderer.invoke("release-notes:mark-seen", version),
  },
  errorOpenFolder: () => ipcRenderer.invoke("error:open-folder"),
  errorReport: (entry: unknown) => ipcRenderer.invoke("error:report", entry),
  onErrorAppended: (cb: Callback) =>
    ipcRenderer.on("error:appended", (_, data) => cb(data)),

  // Phase C2: per-app snooze (C2 功能已退役, 移除)
  // setAppSnooze / clearAppSnooze IPC 已删除

  // v2.9.0 世界杯专栏: 拉 + 解析 Football.TXT
  worldcupFetchFixtures: (payload: unknown) =>
    ipcRenderer.invoke("worldcup:fetch-fixtures", payload),
  worldcupLoadScores: () => ipcRenderer.invoke("worldcup:load-scores"),
  worldcupRefreshScores: (payload: unknown) =>
    ipcRenderer.invoke("worldcup:refresh-scores", payload),
  worldcupLoadInsights: () => ipcRenderer.invoke("worldcup:load-insights"),
  worldcupGenerateInsight: (payload: unknown) =>
    ipcRenderer.invoke("worldcup:generate-insight", payload),

  // v2.10.0 世界杯体彩记账 (stake + pnl per matchday)
  worldcupLoadBets: () => ipcRenderer.invoke("worldcup:load-bets"),
  worldcupUpsertBet: (payload: unknown) =>
    ipcRenderer.invoke("worldcup:upsert-bet", payload),
  worldcupRemoveBet: (date: string) =>
    ipcRenderer.invoke("worldcup:remove-bet", date),

  // 世界杯淘汰赛对阵表 (bracket compute + load)
  worldcupComputeBracket: (payload: unknown) =>
    ipcRenderer.invoke("worldcup:compute-bracket", payload),
  worldcupLoadBracket: () => ipcRenderer.invoke("worldcup:load-bracket"),

  // v2.16.0 世界杯进球通知: main 推通知点击 → renderer 切 tab + scroll
  onWorldcupFocusMatch: (cb: Callback) =>
    ipcRenderer.on("worldcup:focus-match", (_, data) => cb(data)),

  // v2.51 世界杯实时比分: goal-watcher sweep 完推 renderer, 触发面板自动刷新.
  // 返回 unsubscribe 函数, 避免 renderer 重复注册导致内存泄漏.
  onWorldcupScoresUpdated: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("worldcup:scores-updated", handler);
    return () => ipcRenderer.removeListener("worldcup:scores-updated", handler);
  },

  getAiSharedConfig: () => ipcRenderer.invoke("ai:get-shared-config"),

  // Universal "open URL in system browser" bridge (validated http/https in main process).
  openUrl: (url: string) => ipcRenderer.invoke("open-url:open", url),

  // 微信热搜 (v2.24)
  wechatHotLoad: () => ipcRenderer.invoke("wechat-hot:load"),
  wechatHotRefresh: () => ipcRenderer.invoke("wechat-hot:refresh"),
  wechatHotLoadRead: () => ipcRenderer.invoke("wechat-hot:load-read"),
  wechatHotMarkRead: (title: string) =>
    ipcRenderer.invoke("wechat-hot:mark-read", title),
  onWechatHotUpdated: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("wechat-hot:updated", handler);
    return () => ipcRenderer.removeListener("wechat-hot:updated", handler);
  },

  // IT之家新闻
  ithomeLoadNews: () => ipcRenderer.invoke("ithome:load-news"),
  ithomeRefreshNews: (dateKey: string) =>
    ipcRenderer.invoke("ithome:refresh-news", dateKey),
  ithomeFetchDay: (dateKey: string) =>
    ipcRenderer.invoke("ithome:fetch-day", dateKey),
  ithomeSummarizeArticle: (payload: unknown) =>
    ipcRenderer.invoke("ithome:summarize-article", payload),
  ithomeToggleFavorite: (payload: unknown) =>
    ipcRenderer.invoke("ithome:toggle-favorite", payload),
  ithomeMarkRead: (id: string) => ipcRenderer.invoke("ithome:mark-read", id),
  ithomeShareCard: (id: string) =>
    ipcRenderer.invoke("ithome:share-card", { id }),

  // For share-card off-screen page to receive share-data event
  onShareData: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("share-data", handler);
    return () => ipcRenderer.removeListener("share-data", handler);
  },

  // Off-screen page 主动通知主进程:卡片已渲染完成,主进程可截图
  // 不依赖任何渲染端定时器/setTimeout/rAF(都被 hidden 窗口节流)
  // 通过 IPC 直接驱动主进程 readiness 解析,稳如老狗
  shareCardReady: () => ipcRenderer.send("share-card:ready"),

  // v2.10+ 基金管理: 持仓 CRUD + 净值拉取 / 推送
  fundsList: () => ipcRenderer.invoke("funds:list"),
  fundsAdd: (input: unknown) => ipcRenderer.invoke("funds:add", input),
  fundsUpdate: (id: string, patch: unknown) =>
    ipcRenderer.invoke("funds:update", id, patch),
  fundsRemove: (id: string) => ipcRenderer.invoke("funds:remove", id),
  fundsRestore: (id: string) => ipcRenderer.invoke("funds:restore", id),
  fundsSearch: (query: string) => ipcRenderer.invoke("funds:search", query),
  fundsBackfill: (code: string) => ipcRenderer.invoke("funds:backfill", code),
  fundsNavFetch: () => ipcRenderer.invoke("funds:nav:fetch"),
  fundsNavFetchCodes: (codes: unknown) =>
    ipcRenderer.invoke("funds:nav:fetch-codes", codes),
  fundsNavState: () => ipcRenderer.invoke("funds:nav:state"),
  fundsHistoryList: () => ipcRenderer.invoke("funds:history:list"),
  fundsNavHistory: (code: string, opts: unknown) =>
    ipcRenderer.invoke("funds:nav:history", code, opts),
  fundsIndexHistory: (symbol: string, opts: unknown) =>
    ipcRenderer.invoke("funds:index:history", symbol, opts),
  fundsSetNavSource: (source: string) =>
    ipcRenderer.invoke("funds:set-nav-source", source),
  fundsAlertPrefsGet: () => ipcRenderer.invoke("funds:alert-prefs:get"),
  fundsAlertPrefsSet: (patch: unknown) =>
    ipcRenderer.invoke("funds:alert-prefs:set", patch),
  onFundsNavFetched: (cb: Callback) =>
    ipcRenderer.on("funds:nav:fetched", (_, data) => cb(data)),
  onFundsNavState: (cb: Callback) =>
    ipcRenderer.on("funds:nav:state", (_, data) => cb(data)),
  onFundsHistoryUpdated: (cb: Callback) =>
    ipcRenderer.on("funds:history:updated", (_, data) => cb(data)),

  // v2.11 提醒
  remindersList: () => ipcRenderer.invoke("reminders:list"),
  remindersCreate: (input: unknown) => ipcRenderer.invoke("reminders:create", input),
  remindersUpdate: (id: string, patch: unknown) =>
    ipcRenderer.invoke("reminders:update", { id, patch }),
  remindersRemove: (id: string) => ipcRenderer.invoke("reminders:remove", id),
  remindersMarkDone: (id: string) =>
    ipcRenderer.invoke("reminders:mark-done", id),
  remindersMarkDismissed: (id: string) =>
    ipcRenderer.invoke("reminders:mark-dismissed", id),
  onRemindersFired: (cb: Callback) =>
    ipcRenderer.on("reminders:fired", (_, data) => cb(data)),
  onRemindersOpenModal: (cb: Callback) =>
    ipcRenderer.on("reminders:open-modal", (_, data) => cb(data)),

  // v2.11 时间线
  recentList: () => ipcRenderer.invoke("recent:list"),
  recentPush: (entry: unknown) => ipcRenderer.invoke("recent:push", entry),
  onRecentUpdated: (cb: Callback) =>
    ipcRenderer.on("recent:updated", (_, data) => cb(data)),

  // v2.12 主进程未捕获错误兜底 (main:error)
  onMainError: (cb: Callback) => ipcRenderer.on("main:error", (_, data) => cb(data)),

  // Win 窗口控件: titleBarStyle:'hidden' 隐藏 OS 三键, renderer 画按钮调这里.
  // mac 走 hiddenInset 自带三颗灯, 不调这里.
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),

  // Phase C3: App rollback bridge (C3 功能已退役, 移除)
  // getVersionHistory / rollbackApp / deleteBackup / onVersionHistoryUpdated
  // / onVersionHistoryCountsUpdated IPC 已删除

  // P52: Pulse 自更新 (半自动档: 检测+下载+手动确认安装)
  selfUpdateGetState: () => ipcRenderer.invoke("self-update:get-state"),
  selfUpdateCheck: () => ipcRenderer.invoke("self-update:check"),
  selfUpdateInstall: () => ipcRenderer.invoke("self-update:install"),

  // 选股分析 (阶段一): 筛选 + 搜索
  stocksScreen: (payload: unknown) =>
    ipcRenderer.invoke("stocks:screen", payload),
  stocksSearch: (query: string) =>
    ipcRenderer.invoke("stocks:search", query),
  // 阶段二: AI 推荐筛选条件 (chatCompletion + 24h 缓存)
  stocksAiAdvise: (payload: unknown) =>
    ipcRenderer.invoke("stocks:ai-advise", payload),
  // 阶段三: 个股多角度分析 + AI 详情
  stocksDetailAngles: (payload: unknown) =>
    ipcRenderer.invoke("stocks:detail-angles", payload),
  stocksDetailAnalyze: (payload: unknown) =>
    ipcRenderer.invoke("stocks:detail-analyze", payload),
  // ponytail: 2026-07-07 P1-2 — 单条 angle 的本地快速重解读 (不走 LLM)
  stocksAngleRefresh: (payload: unknown) =>
    ipcRenderer.invoke("stocks:angle-refresh", payload),
  // ponytail 2026-07-18 P0-1 polish #2 — 单条 angle 数据重拉 (走 fetcher, 不是 LLM)
  stocksAngleReload: (payload: unknown) =>
    ipcRenderer.invoke("stocks:angle-reload", payload),
  // 2026-07-07 — 诊断报告导出 PNG (主进程 capturePage + showSaveDialog)
  stocksExportDiagnosisPng: (payload: unknown) =>
    ipcRenderer.invoke("stocks:export-diagnosis-png", payload),

  // v2.49 Overview + Command Palette (T5/T18): IPC bridge
  versionsCommandSearch: (q: string) =>
    ipcRenderer.invoke("versions:command-search", { q }),
  // v2.50 (T5): LibraryPage / PageHeader / OverviewEmptyState / CommandPalette
  // "检查更新" 按钮统一走这里 → main 的 versions:run-check (→ check-runner.runCheckQueued)
  versionsRunCheck: () => ipcRenderer.invoke("versions:run-check"),

  // v2.80 GitHub 优秀项目收录
  // 第二个参数 token 透传给主进程，用于解除未登录 60 次/小时限流。
  githubFetch: (input: unknown, token: string) =>
    ipcRenderer.invoke("github:fetch", { input, token }),
  aiParseReadme: (payload: unknown) => ipcRenderer.invoke("ai:parse-readme", payload),
  // Release 更新追踪：抓取某仓库 recent releases
  githubFetchRelease: (input: unknown, token: string) =>
    ipcRenderer.invoke("github:fetch-release", { input, token }),

  // 游戏优惠聚合 (v2.81): 各平台折扣 / 喜+1 / 热门榜
  getGameDeals: (opts: unknown) => ipcRenderer.invoke("games:getDeals", opts || {}),
  getSteamLowest: (opts: unknown) =>
    ipcRenderer.invoke("games:getSteamLowest", opts || {}),
  getItadLowest: (opts: unknown) =>
    ipcRenderer.invoke("games:getItadLowest", opts || {}),
  getFx: (opts: unknown) => ipcRenderer.invoke("games:getFx", opts || {}),
  // AI 榜单排名模块 (v2.82): 白名单双通道
  getLeaderboard: (opts: unknown) => ipcRenderer.invoke("leaderboard:get", opts || {}),
  refreshLeaderboard: (opts: unknown) =>
    ipcRenderer.invoke("leaderboard:refresh", opts || {}),
  rateBudget: () => ipcRenderer.invoke("leaderboard:rate-budget"),
  // 2026-07-22: 工具栏「导出 CSV」→ 主进程 dialog.showSaveDialog + fs.writeFile
  exportLeaderboardCsv: (payload: unknown) =>
    ipcRenderer.invoke("leaderboard:export-csv", payload || {}),
};

// Phase v1: Tray 菜单配置 (主面板内 modal)
// 独立 contextBridge 跟在 metalsApi 后面, 不并入 `api` 因为 spec 把这个当作"用户偏好面板",
// 不属于业务 API 表面 (供未来 power user / 第三方接入复用).
export const pulse = {
  tray: {
    // 渲染端主动通知 main (目前 modal 走 main → renderer 的 open 信号,
    // 这里保留对称 API, 方便未来由 renderer 直接发起).
    openConfig: () => ipcRenderer.send("tray:open-config"),
    closeConfigModal: () => ipcRenderer.send("tray:close-config"),
    getPrefs: () => ipcRenderer.invoke("tray:get-prefs"),
    savePrefs: (prefs: unknown) => ipcRenderer.invoke("tray:save-prefs", prefs),
    // main → renderer listener (返回 unsubscribe 函数, modal unmount 时清理).
    onOpenConfig: (cb: () => void) => {
      const handler = (_evt: IpcRendererEvent) => cb();
      ipcRenderer.on("tray:open-config", handler);
      return () => ipcRenderer.removeListener("tray:open-config", handler);
    },
    onCloseConfigModal: (cb: () => void) => {
      const handler = (_evt: IpcRendererEvent) => cb();
      ipcRenderer.on("tray:close-config", handler);
      return () => ipcRenderer.removeListener("tray:close-config", handler);
    },
  },
};

// 贵金属 (v2.20.0) — 独立 contextBridge, 跟 funds / reminders / worldcup 一致
export const metalsApi = {
  list: () => ipcRenderer.invoke("metals:list"),
  updateConfig: (patch: unknown) =>
    ipcRenderer.invoke("metals:config:update", { patch }),
  upsertHolding: (id: string, holding: unknown) =>
    ipcRenderer.invoke("metals:holding:upsert", { id, holding }),
  removeHolding: (id: string) =>
    ipcRenderer.invoke("metals:holding:remove", { id }),
  fetchNow: () => ipcRenderer.invoke("metals:quote:fetch"),
  getState: () => ipcRenderer.invoke("metals:quote:state"),
  onQuoteChanged: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("metals:quote:changed", handler);
    return () => ipcRenderer.removeListener("metals:quote:changed", handler);
  },
  onStateUpdate: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("metals:quote:state-changed", handler);
    return () =>
      ipcRenderer.removeListener("metals:quote:state-changed", handler);
  },
  getHistory: () => ipcRenderer.invoke("metals:history:get"),
  onHistoryChanged: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("metals:history:changed", handler);
    return () => ipcRenderer.removeListener("metals:history:changed", handler);
  },

  // P10: 主题切换 IPC 桥接
  themeGet: () => ipcRenderer.invoke("theme:get"),
  themeSet: (mode: string) => ipcRenderer.invoke("theme:set", mode),
  onThemeChanged: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("theme:changed", handler);
    return () => ipcRenderer.removeListener("theme:changed", handler);
  },
};

contextBridge.exposeInMainWorld("platformInfo", platformInfo);
contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("pulse", pulse);
contextBridge.exposeInMainWorld("metalsApi", metalsApi);
