const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("platformInfo", {
  platform: process.platform,
});

contextBridge.exposeInMainWorld("api", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  getCachedState: () => ipcRenderer.invoke("get-cached-state"),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  brewUpgrade: (cask) => ipcRenderer.invoke("brew-upgrade", cask),
  brewUpdate: () => ipcRenderer.invoke("brew-update"),
  getAppIcon: (b) => ipcRenderer.invoke("get-app-icon", b),

  onCheckProgress: (cb) =>
    ipcRenderer.on("check-progress", (_, data) => cb(data)),
  onCheckDetecting: (cb) =>
    ipcRenderer.on("check-detecting", (_, data) => cb(data)),
  onStartCheck: (cb) => ipcRenderer.on("start-check", () => cb()),
  onAutoCheckFinished: (cb) =>
    ipcRenderer.on("auto-check-finished", (_, data) => cb(data)),
  onCheckFinished: (cb) =>
    ipcRenderer.on("check-finished", (_, data) => cb(data)),
  // v2.22: 菜单栏点击更新行 → renderer 接收定位指令
  onTrayFocus: (cb) => ipcRenderer.on("tray:focus", (_, data) => cb(data)),

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
  getAiKey: (providerId) =>
    ipcRenderer.invoke("ai-sessions:get-key", providerId),
  aiHealthcheck: (opts) => ipcRenderer.invoke("ai-sessions:healthcheck", opts),
  getAiSessionsConfig: () => ipcRenderer.invoke("ai-sessions:get-config"),
  saveAiSessionsConfig: (cfg) =>
    ipcRenderer.invoke("ai-sessions:save-config", cfg),
  onAiSessionsConfigUpdated: (cb) =>
    ipcRenderer.on("ai-sessions-config-updated", (_, data) => cb(data)),

  // v2.13 AI 用量 (Minimax coding plan)
  aiUsageGetCached: () => ipcRenderer.invoke("ai-usage:get-cached"),
  aiUsageFetch: (opts) => ipcRenderer.invoke("ai-usage:fetch", opts),
  onAiUsageUpdated: (cb) =>
    ipcRenderer.on("ai-usage-updated", (_, data) => cb(data)),

  // Phase Q8: state.json corruption self-recovery banner
  onStateRecovered: (cb) =>
    ipcRenderer.on("state:recovered", (_, data) => cb(data)),

  // Phase I5: daily digest
  digestFetchSections: () => ipcRenderer.invoke("digest:fetch-sections"),
  digestUpdateSettings: (cfg) => ipcRenderer.invoke("digest:update-settings", cfg),
  onDigestOpen: (cb) => ipcRenderer.on("digest:open", (_, data) => cb(data)),

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

  // 世界杯淘汰赛对阵表 (bracket compute + load)
  worldcupComputeBracket: (payload) =>
    ipcRenderer.invoke("worldcup:compute-bracket", payload),
  worldcupLoadBracket: () => ipcRenderer.invoke("worldcup:load-bracket"),

  // v2.16.0 世界杯进球通知: main 推通知点击 → renderer 切 tab + scroll
  onWorldcupFocusMatch: (cb) =>
    ipcRenderer.on("worldcup:focus-match", (_, data) => cb(data)),

  getAiSharedConfig: () => ipcRenderer.invoke("ai:get-shared-config"),

  // Universal "open URL in system browser" bridge (validated http/https in main process).
  openUrl: (url) => ipcRenderer.invoke("open-url:open", url),

  // 微信热搜 (v2.24)
  wechatHotLoad: () => ipcRenderer.invoke("wechat-hot:load"),
  wechatHotRefresh: () => ipcRenderer.invoke("wechat-hot:refresh"),
  onWechatHotUpdated: (cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on("wechat-hot:updated", handler);
    return () => ipcRenderer.removeListener("wechat-hot:updated", handler);
  },

  // IT之家新闻
  ithomeLoadNews: () => ipcRenderer.invoke("ithome:load-news"),
  ithomeRefreshNews: (dateKey) =>
    ipcRenderer.invoke("ithome:refresh-news", dateKey),
  ithomeFetchDay: (dateKey) => ipcRenderer.invoke("ithome:fetch-day", dateKey),
  ithomeSummarizeArticle: (payload) =>
    ipcRenderer.invoke("ithome:summarize-article", payload),
  ithomeToggleFavorite: (payload) =>
    ipcRenderer.invoke("ithome:toggle-favorite", payload),
  ithomeMarkRead: (id) => ipcRenderer.invoke("ithome:mark-read", id),
  ithomeMarkRead: (id) => ipcRenderer.invoke("ithome:mark-read", id),
  ithomeShareCard: (id) => ipcRenderer.invoke("ithome:share-card", { id }),

  // For share-card off-screen page to receive share-data event
  onShareData: (cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on("share-data", handler);
    return () => ipcRenderer.removeListener("share-data", handler);
  },

  // Off-screen page 主动通知主进程:卡片已渲染完成,主进程可截图
  // 不依赖任何渲染端定时器/setTimeout/rAF(都被 hidden 窗口节流)
  // 通过 IPC 直接驱动主进程 readiness 解析,稳如老狗
  shareCardReady: () => ipcRenderer.send("share-card:ready"),

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

  // v2.12 主进程未捕获错误兜底 (main:error)
  onMainError: (cb) => ipcRenderer.on("main:error", (_, data) => cb(data)),
});

// 贵金属 (v2.20.0) — 独立 contextBridge, 跟 funds / reminders / worldcup 一致
contextBridge.exposeInMainWorld("metalsApi", {
  list: () => ipcRenderer.invoke("metals:list"),
  updateConfig: (patch) =>
    ipcRenderer.invoke("metals:config:update", { patch }),
  upsertHolding: (id, holding) =>
    ipcRenderer.invoke("metals:holding:upsert", { id, holding }),
  removeHolding: (id) => ipcRenderer.invoke("metals:holding:remove", { id }),
  fetchNow: () => ipcRenderer.invoke("metals:quote:fetch"),
  getState: () => ipcRenderer.invoke("metals:quote:state"),
  onQuoteChanged: (cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on("metals:quote:changed", handler);
    return () => ipcRenderer.removeListener("metals:quote:changed", handler);
  },
  onStateUpdate: (cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on("metals:quote:state-changed", handler);
    return () =>
      ipcRenderer.removeListener("metals:quote:state-changed", handler);
  },
});
