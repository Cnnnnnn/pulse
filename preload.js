const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  getCachedState: () => ipcRenderer.invoke("get-cached-state"),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  brewUpgrade: (cask) => ipcRenderer.invoke("brew-upgrade", cask),
  brewUpdate: () => ipcRenderer.invoke("brew-update"),
  getAppIcon: (b) => ipcRenderer.invoke("get-app-icon", b),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),

  onCheckProgress: (cb) =>
    ipcRenderer.on("check-progress", (_, data) => cb(data)),
  onCheckDetecting: (cb) =>
    ipcRenderer.on("check-detecting", (_, data) => cb(data)),
  onStartCheck: (cb) => ipcRenderer.on("start-check", () => cb()),
  onAutoCheckFinished: (cb) =>
    ipcRenderer.on("auto-check-finished", (_, data) => cb(data)),
  onCheckFinished: (cb) =>
    ipcRenderer.on("check-finished", (_, data) => cb(data)),

  // Bulk Upgrade (Phase22)
  bulkUpgradeStart: (items) => ipcRenderer.invoke("bulk-upgrade:start", items),
  bulkUpgradeCancel: () => ipcRenderer.invoke("bulk-upgrade:cancel"),
  onBulkUpgradeProgress: (cb) =>
    ipcRenderer.on("bulk-upgrade:progress", (_, data) => cb(data)),
  onBulkUpgradeDone: (cb) =>
    ipcRenderer.on("bulk-upgrade:done", (_, data) => cb(data)),

  // Phase27: Mutes (per-app静音)
  getMutes: () => ipcRenderer.invoke("get-mutes"),
  setMute: (name, durationSec) =>
    ipcRenderer.invoke("set-mute", name, durationSec),
  clearMute: (name) => ipcRenderer.invoke("clear-mute", name),

  // Phase29: Last-opened (per-app 最近打开)
  getLastOpened: () => ipcRenderer.invoke("get-last-opened"),
  refreshLastOpened: () => ipcRenderer.invoke("refresh-last-opened"),
  onLastOpenedUpdated: (cb) =>
    ipcRenderer.on("last-opened-updated", (_, data) => cb(data)),

  // Phase A (App Categorization): active category tab
  getActiveCategory: () => ipcRenderer.invoke("get-active-category"),
  saveActiveCategory: (id) => ipcRenderer.invoke("save-active-category", id),

  // AI 任务总结 (重做版): 按需扫描 + 按需生成
  listAiTasks: (opts) => ipcRenderer.invoke("ai-tasks:list", opts),
  summarizeAiTasks: (opts) => ipcRenderer.invoke("ai-tasks:summarize", opts),
  onAiTaskSummaryUpdated: (cb) =>
    ipcRenderer.on("ai-task-summary-updated", (_, data) => cb(data)),
  // 跳到原始 session (任务卡 "查看原始" 用)
  openSession: (target) =>
    ipcRenderer.invoke("ai-sessions:open-session", target),

  // Phase B6c (AI Sessions Settings): safeStorage API key + config
  setAiKey: (providerId, apiKey) =>
    ipcRenderer.invoke("ai-sessions:set-key", providerId, apiKey),
  clearAiKey: (providerId) =>
    ipcRenderer.invoke("ai-sessions:clear-key", providerId),
  hasAiKey: (providerId) =>
    ipcRenderer.invoke("ai-sessions:has-key", providerId),
  aiHealthcheck: (opts) => ipcRenderer.invoke("ai-sessions:healthcheck", opts),
  getAiSessionsConfig: () => ipcRenderer.invoke("ai-sessions:get-config"),
  saveAiSessionsConfig: (cfg) =>
    ipcRenderer.invoke("ai-sessions:save-config", cfg),
  onAiSessionsConfigUpdated: (cb) =>
    ipcRenderer.on("ai-sessions-config-updated", (_, data) => cb(data)),

  // v2.9.0 世界杯专栏: 拉 + 解析 Football.TXT
  worldcupFetchFixtures: (payload) =>
    ipcRenderer.invoke("worldcup:fetch-fixtures", payload),
  worldcupLoadScores: () => ipcRenderer.invoke("worldcup:load-scores"),
  worldcupRefreshScores: (payload) =>
    ipcRenderer.invoke("worldcup:refresh-scores", payload),
  worldcupLoadInsights: () => ipcRenderer.invoke("worldcup:load-insights"),
  worldcupGenerateInsight: (payload) =>
    ipcRenderer.invoke("worldcup:generate-insight", payload),

  // v2.10.0 世界杯体彩记账 (stake + pnl per matchday)
  worldcupLoadBets: () => ipcRenderer.invoke("worldcup:load-bets"),
  worldcupUpsertBet: (payload) =>
    ipcRenderer.invoke("worldcup:upsert-bet", payload),
  worldcupRemoveBet: (date) => ipcRenderer.invoke("worldcup:remove-bet", date),
  getAiSharedConfig: () => ipcRenderer.invoke("ai:get-shared-config"),

  // IT之家新闻
  ithomeLoadNews: () => ipcRenderer.invoke("ithome:load-news"),
  ithomeRefreshNews: (dateKey) =>
    ipcRenderer.invoke("ithome:refresh-news", dateKey),
  ithomeFetchDay: (dateKey) => ipcRenderer.invoke("ithome:fetch-day", dateKey),
  ithomeSummarizeArticle: (payload) =>
    ipcRenderer.invoke("ithome:summarize-article", payload),
  ithomeToggleFavorite: (payload) =>
    ipcRenderer.invoke("ithome:toggle-favorite", payload),

  // v2.10+ 基金管理: 持仓 CRUD + 净值拉取 / 推送
  fundsList: () => ipcRenderer.invoke("funds:list"),
  fundsAdd: (input) => ipcRenderer.invoke("funds:add", input),
  fundsUpdate: (id, patch) => ipcRenderer.invoke("funds:update", id, patch),
  fundsRemove: (id) => ipcRenderer.invoke("funds:remove", id),
  fundsRestore: (id) => ipcRenderer.invoke("funds:restore", id),
  fundsSearch: (query) => ipcRenderer.invoke("funds:search", query),
  fundsBackfill: (code) => ipcRenderer.invoke("funds:backfill", code),
  fundsNavFetch: () => ipcRenderer.invoke("funds:nav:fetch"),
  fundsNavFetchCodes: (codes) =>
    ipcRenderer.invoke("funds:nav:fetch-codes", codes),
  fundsNavState: () => ipcRenderer.invoke("funds:nav:state"),
  fundsHistoryList: () => ipcRenderer.invoke("funds:history:list"),
  fundsSetNavSource: (source) =>
    ipcRenderer.invoke("funds:set-nav-source", source),
  onFundsNavFetched: (cb) =>
    ipcRenderer.on("funds:nav:fetched", (_, data) => cb(data)),
  onFundsNavState: (cb) =>
    ipcRenderer.on("funds:nav:state", (_, data) => cb(data)),
  onFundsHistoryUpdated: (cb) =>
    ipcRenderer.on("funds:history:updated", (_, data) => cb(data)),

  // v2.11 提醒
  remindersList: () => ipcRenderer.invoke("reminders:list"),
  remindersCreate: (input) => ipcRenderer.invoke("reminders:create", input),
  remindersUpdate: (id, patch) =>
    ipcRenderer.invoke("reminders:update", { id, patch }),
  remindersRemove: (id) => ipcRenderer.invoke("reminders:remove", id),
  remindersMarkDone: (id) => ipcRenderer.invoke("reminders:mark-done", id),
  remindersMarkDismissed: (id) =>
    ipcRenderer.invoke("reminders:mark-dismissed", id),
  onRemindersFired: (cb) =>
    ipcRenderer.on("reminders:fired", (_, data) => cb(data)),
  onRemindersOpenModal: (cb) =>
    ipcRenderer.on("reminders:open-modal", (_, data) => cb(data)),

  // v2.11 时间线
  recentList: () => ipcRenderer.invoke("recent:list"),
  recentPush: (entry) => ipcRenderer.invoke("recent:push", entry),
  onRecentUpdated: (cb) =>
    ipcRenderer.on("recent:updated", (_, data) => cb(data)),
});
