import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type { Callback, PlatformInfo, Unsubscribe } from "./src/shared/preload-types";
import type {
  AiLeaderboardApiContract,
  AppInfoApiContract,
  AiPromptsApiContract,
  AiSessionsApiContract,
  AiSharedConfigApiContract,
  AiTaskSummaryUpdatedPayload,
  AiTasksApiContract,
  AiSessionsConfigUpdatedPayload,
  AiReadmeParsePayload,
  AiAdviceApiContract,
  AiFeedbackApiContract,
  TokenBudgetApiContract,
  MutesApiContract,
  LastOpenedApiContract,
  LastOpenedUpdatedPayload,
  WindowApiContract,
  OpenUrlApiContract,
  BulkUpgradeApiContract,
  BulkUpgradeProgressPayload,
  BulkUpgradeSummary,
  NavigationPersistenceApiContract,
  ConfigStateApiContract,
  CheckProgressPayload,
  CheckStartedPayload,
  CheckDetectingPayload,
  CheckFinishedPayload,
  TrayFocusPayload,
  SidenavBadgePayload,
  StateRecoveredPayload,
  MainErrorPayload,
  UpgradeActionsApiContract,
  GithubApiContract,
  VaultApiContract,
  UpdateCheckApiContract,
  VersionsApiContract,
  AiUsageApiContract,
  DigestApiContract,
  DigestOpenPayload,
  AiUsageUpdatedPayload,
  DiagnosticsApiContract,
  ErrorAppendedPayload,
  ConfigPortabilityApiContract,
  CoreEventsApiContract,
  FinanceApiContract,
  FundsHistoryUpdatedPayload,
  FundsApiContract,
  FundsNavFetchedPayload,
  FundsNavStatePayload,
  IthomeApiContract,
  IthomeArticleIdPayload,
  IthomeSummarizePayload,
  MetalQuoteChangedPayload,
  MetalStateResponse,
  MetalsApiContract,
  RecentApiContract,
  RecentUpdatedPayload,
  ReleaseNotesApiContract,
  ReminderFiredPayload,
  ReminderOpenModalPayload,
  RemindersApiContract,
  StocksApiContract,
  SelfUpdateApiContract,
  SearchApiContract,
  PulseTrayApiContract,
  ThemeControlApiContract,
  ThemeChangedPayload,
  ThemeSyncApiContract,
  WechatHotApiContract,
  WechatHotPayload,
  MoviesPayload,
  ConcertsPayload,
  WatchlistApiContract,
  IpcChannelMap,
} from "./src/shared/ipc-contracts";

export const platformInfo: PlatformInfo = {
  platform: process.platform,
};

function subscribe<T>(channel: string, cb: Callback<T>): Unsubscribe {
  const handler = (_evt: IpcRendererEvent, data: unknown) =>
    cb(data as T);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

function subscribeVoid(channel: string, cb: () => void): Unsubscribe {
  const handler = (_evt: IpcRendererEvent) => cb();
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

/**
 * Typed invoke boundary for channels that have entered IpcChannelMap.
 * Keeping the cast here confines Electron's untyped invoke surface to one
 * place; individual bridge methods then expose their domain argument/result.
 */
function invokeChannel<C extends keyof IpcChannelMap>(
  channel: C,
  ...args: IpcChannelMap[C]["args"]
): Promise<IpcChannelMap[C]["result"]> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcChannelMap[C]["result"]>;
}

export const api = {
  getConfig: () => invokeChannel("get-config"),
  getCachedState: () => invokeChannel("get-cached-state"),
  appGetVersion: () => invokeChannel("app:get-version"),
  searchQuery: (q: string, source: string | null = null) =>
    invokeChannel("search:query", { q, source }),
  searchUpsert: (doc: IpcChannelMap["search:upsert"]["args"][0]) =>
    invokeChannel("search:upsert", doc),
  checkUpdates: () => invokeChannel("check-updates"),
  cancelCheck: (jobId?: IpcChannelMap["check-updates:cancel"]["args"][0]) =>
    invokeChannel("check-updates:cancel", jobId),
  brewUpgrade: (cask: IpcChannelMap["brew-upgrade"]["args"][0]) =>
    invokeChannel("brew-upgrade", cask),
  getAppIcon: (bundlePath: IpcChannelMap["get-app-icon"]["args"][0]) =>
    invokeChannel("get-app-icon", bundlePath),

  onCheckProgress: (cb: Callback<CheckProgressPayload>) =>
    subscribe("check-progress", cb),
  onCheckStarted: (cb: Callback<CheckStartedPayload>) =>
    subscribe("check-started", cb),
  onCheckDetecting: (cb: Callback<CheckDetectingPayload>) =>
    subscribe("check-detecting", cb),
  onStartCheck: (cb: () => void) => subscribeVoid("start-check", cb),
  onAutoCheckFinished: (cb: Callback<CheckFinishedPayload>) =>
    subscribe("auto-check-finished", cb),
  onCheckFinished: (cb: Callback<CheckFinishedPayload>) =>
    subscribe("check-finished", cb),
  // v2.22: 菜单栏点击更新行 → renderer 接收定位指令
  onTrayFocus: (cb: Callback<TrayFocusPayload>) =>
    subscribe("tray:focus", cb),

  // Bulk Upgrade (Phase22)
  bulkUpgradeStart: (items: IpcChannelMap["bulk-upgrade:start"]["args"][0]) =>
    invokeChannel("bulk-upgrade:start", items),
  bulkUpgradeCancel: () => invokeChannel("bulk-upgrade:cancel"),
  onBulkUpgradeProgress: (cb: Callback<BulkUpgradeProgressPayload>) =>
    subscribe("bulk-upgrade:progress", cb),
  onBulkUpgradeDone: (cb: Callback<BulkUpgradeSummary>) =>
    subscribe("bulk-upgrade:done", cb),

  // Phase27: Mutes (per-app静音)
  getMutes: () => invokeChannel("get-mutes"),
  setMute: (
    name: IpcChannelMap["set-mute"]["args"][0],
    durationSec: IpcChannelMap["set-mute"]["args"][1],
  ) => invokeChannel("set-mute", name, durationSec),
  clearMute: (name: IpcChannelMap["clear-mute"]["args"][0]) =>
    invokeChannel("clear-mute", name),

  // Phase29: Last-opened (per-app 最近打开)
  getLastOpened: () => invokeChannel("get-last-opened"),
  refreshLastOpened: () => invokeChannel("refresh-last-opened"),
  onLastOpenedUpdated: (cb: Callback<LastOpenedUpdatedPayload>) =>
    subscribe("last-opened-updated", cb),

  // Phase A (App Categorization): active category tab
  getActiveCategory: () => invokeChannel("get-active-category"),
  saveActiveCategory: (
    id: IpcChannelMap["save-active-category"]["args"][0],
  ) => invokeChannel("save-active-category", id),

  // P-N: HomeGrid 落点
  getLastActiveNav: () => invokeChannel("get-last-active-nav"),
  saveLastActiveNav: (
    key: IpcChannelMap["save-last-active-nav"]["args"][0],
  ) => invokeChannel("save-last-active-nav", key),

  // AI 任务总结 (重做版): 按需扫描 + 按需生成
  listAiTasks: (
    opts?: IpcChannelMap["ai-tasks:list"]["args"][0],
  ) => invokeChannel("ai-tasks:list", opts),
  summarizeAiTasks: (
    opts: IpcChannelMap["ai-tasks:summarize"]["args"][0],
  ) => invokeChannel("ai-tasks:summarize", opts),
  onAiTaskSummaryUpdated: (cb: Callback<AiTaskSummaryUpdatedPayload>) =>
    subscribe("ai-task-summary-updated", cb),
  // 跳到原始 session (任务卡 "查看原始" 用)
  openSession: (target: IpcChannelMap["ai-sessions:open-session"]["args"][0]) =>
    invokeChannel("ai-sessions:open-session", target),

  // Phase B6c (AI Sessions Settings): safeStorage API key + config
  setAiKey: (
    providerId: IpcChannelMap["ai-sessions:set-key"]["args"][0],
    apiKey: IpcChannelMap["ai-sessions:set-key"]["args"][1],
  ) => invokeChannel("ai-sessions:set-key", providerId, apiKey),
  clearAiKey: (providerId: IpcChannelMap["ai-sessions:clear-key"]["args"][0]) =>
    invokeChannel("ai-sessions:clear-key", providerId),
  hasAiKey: (providerId: IpcChannelMap["ai-sessions:has-key"]["args"][0]) =>
    invokeChannel("ai-sessions:has-key", providerId),
  aiHealthcheck: (opts: IpcChannelMap["ai-sessions:healthcheck"]["args"][0]) =>
    invokeChannel("ai-sessions:healthcheck", opts),
  getAiSessionsConfig: () => invokeChannel("ai-sessions:get-config"),
  saveAiSessionsConfig: (
    cfg: IpcChannelMap["ai-sessions:save-config"]["args"][0],
  ) => invokeChannel("ai-sessions:save-config", cfg),
  onAiSessionsConfigUpdated: (cb: Callback<AiSessionsConfigUpdatedPayload>) =>
    subscribe("ai-sessions-config-updated", cb),

  // A7: AI prompt 模板化
  aiPromptsLoad: () => invokeChannel("ai-prompts:load"),
  aiPromptsSave: (prompts: IpcChannelMap["ai-prompts:save"]["args"][0]) =>
    invokeChannel("ai-prompts:save", prompts),
  aiPromptsReset: (key: IpcChannelMap["ai-prompts:reset"]["args"][0]) =>
    invokeChannel("ai-prompts:reset", key),
  upgradeAdviceFetch: (opts: IpcChannelMap["upgrade-advice:fetch"]["args"][0]) =>
    invokeChannel("upgrade-advice:fetch", opts),
  changelogSummaryFetch: (
    opts: IpcChannelMap["changelog-summary:fetch"]["args"][0],
  ) => invokeChannel("changelog-summary:fetch", opts),
  feedbackRecord: (payload: IpcChannelMap["feedback:record"]["args"][0]) =>
    invokeChannel("feedback:record", payload),
  feedbackExport: () => invokeChannel("feedback:export"),
  tokenBudgetGet: () => invokeChannel("token-budget:get"),
  tokenBudgetSet: (payload: IpcChannelMap["token-budget:set"]["args"][0]) =>
    invokeChannel("token-budget:set", payload),
  configExport: (pulseVersion: string = "") =>
    invokeChannel("config:export", pulseVersion),
  configImportLoad: () => invokeChannel("config:import-load"),
  configImportApply: (
    payload: IpcChannelMap["config:import-apply"]["args"][0],
  ) => invokeChannel("config:import-apply", payload),
  onAiPromptsUpdated: (cb: () => void) => {
    const handler = (_evt: IpcRendererEvent) => cb();
    ipcRenderer.on("ai-prompts-updated", handler);
    return () => ipcRenderer.removeListener("ai-prompts-updated", handler);
  },

  // P10: 主题切换顶层 bridge (renderer/index.tsx bootstrap + theme-manager 都用)
  // 同时也在 metalsApi 里留一份以兼容早期 theme-manager 直接用 window.metalsApi.themeSet 的代码.
  themeSet: (mode: IpcChannelMap["theme:set"]["args"][0]) =>
    invokeChannel("theme:set", mode),
  onThemeChanged: (cb: Callback<ThemeChangedPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as ThemeChangedPayload);
    ipcRenderer.on("theme:changed", handler);
    return () => ipcRenderer.removeListener("theme:changed", handler);
  },

  // v2.13 AI 用量 (Minimax coding plan)
  aiUsageGetCached: () => invokeChannel("ai-usage:get-cached"),
  aiUsageFetch: (opts: IpcChannelMap["ai-usage:fetch"]["args"][0]) =>
    invokeChannel("ai-usage:fetch", opts),
  aiUsageAlertPrefsGet: () => invokeChannel("ai-usage:alert-prefs:get"),
  aiUsageAlertPrefsSet: (
    patch: IpcChannelMap["ai-usage:alert-prefs:set"]["args"][0],
  ) => invokeChannel("ai-usage:alert-prefs:set", patch),
  onAiUsageUpdated: (cb: Callback<AiUsageUpdatedPayload>) =>
    subscribe("ai-usage-updated", cb),
  onSidenavBadge: (cb: Callback<SidenavBadgePayload>) =>
    subscribe("sidenav:badge", cb),

  // Phase Q8: state.json corruption self-recovery banner
  onStateRecovered: (cb: Callback<StateRecoveredPayload>) =>
    subscribe("state:recovered", cb),

  // Phase I5: daily digest
  digestFetchSections: () => invokeChannel("digest:fetch-sections"),
  digestUpdateSettings: (
    cfg: IpcChannelMap["digest:update-settings"]["args"][0],
  ) => invokeChannel("digest:update-settings", cfg),
  onDigestOpen: (cb: Callback<DigestOpenPayload>) =>
    subscribe("digest:open", cb),

  // Phase Q6: error aggregator
  errorFetchEntries: (opts: IpcChannelMap["error:fetch-entries"]["args"][0]) =>
    invokeChannel("error:fetch-entries", opts),
  errorCopyAll: () => invokeChannel("error:copy-all"),
  errorExportZip: (opts?: IpcChannelMap["error:export-zip"]["args"][0]) =>
    invokeChannel("error:export-zip", opts),
  errorClearOld: (opts?: IpcChannelMap["error:clear-old"]["args"][0]) =>
    invokeChannel("error:clear-old", opts),
  errorOpenFolder: () => invokeChannel("error:open-folder"),
  errorReport: (entry: IpcChannelMap["error:report"]["args"][0]) =>
    invokeChannel("error:report", entry),
  // Phase Q1 v2: diagnostics drawer
  diagnosticsFetch: (opts: IpcChannelMap["diagnostics:fetch"]["args"][0]) =>
    invokeChannel("diagnostics:fetch", opts),
  diagnosticsFetchSamples: () => invokeChannel("diagnostics:fetch-samples"),
  // C7 v2.35.0: 检测结果导出
  detectResultsExport: (
    opts: IpcChannelMap["detect-results:export"]["args"][0],
  ) => invokeChannel("detect-results:export", opts),
  // I2 v1: watchlist (pinned apps)
  watchlistList: () => invokeChannel("watchlist:list"),
  watchlistAdd: (
    payload: string | IpcChannelMap["watchlist:add"]["args"][0],
  ) =>
    invokeChannel(
      "watchlist:add",
      typeof payload === "string" ? { appName: payload } : payload,
    ),
  watchlistRemove: (
    payload: string | IpcChannelMap["watchlist:remove"]["args"][0],
  ) =>
    invokeChannel(
      "watchlist:remove",
      typeof payload === "string" ? { appName: payload } : payload,
    ),
  // ON: release notes onboarding (nested form, 跟 spec §3.4 一致)
  releaseNotes: {
    getCurrent: () => invokeChannel("release-notes:get-current"),
    getVersion: (
      version: IpcChannelMap["release-notes:get-version"]["args"][0],
    ) => invokeChannel("release-notes:get-version", version),
    markSeen: (version: IpcChannelMap["release-notes:mark-seen"]["args"][0]) =>
      invokeChannel("release-notes:mark-seen", version),
  },
  onErrorAppended: (cb: Callback<ErrorAppendedPayload>) =>
    subscribe("error:appended", cb),

  // Phase C2: per-app snooze (C2 功能已退役, 移除)
  // setAppSnooze / clearAppSnooze IPC 已删除


  getAiSharedConfig: () => invokeChannel("ai:get-shared-config"),
  aiChat: (opts: IpcChannelMap["ai:chat"]["args"][0]) =>
    invokeChannel("ai:chat", opts),
  aiChatCancel: () => invokeChannel("ai:chat-cancel"),
  // P3-12: 助手会话持久化备份 (state.json assistantThreads)
  assistantThreadsSave: (
    payload: IpcChannelMap["assistant-threads:save"]["args"][0],
  ) => invokeChannel("assistant-threads:save", payload),
  assistantThreadsLoad: () => invokeChannel("assistant-threads:load"),
  onAiChatDelta: (cb: Callback<{ delta: string }>) =>
    subscribe("ai:chat-delta", cb),
  onAiChatStatus: (cb: Callback<{ status: string }>) =>
    subscribe("ai:chat-status", cb),
  // P3-15: 工具结果即时展示 (渐进式)
  onAiChatToolResults: (cb: Callback<{ toolResults: unknown }>) =>
    subscribe("ai:chat-tool-results", cb),
  // P3-13: 助手多模态 — 当前页面截图 (返回 data:image/png;base64,...)
  assistantScreenshot: () => invokeChannel("assistant:screenshot"),

  // Universal "open URL in system browser" bridge (validated http/https in main process).
  openUrl: (url: IpcChannelMap["open-url:open"]["args"][0]) =>
    invokeChannel("open-url:open", url),

  // 微信热搜 (v2.24)
  wechatHotLoad: () => invokeChannel("wechat-hot:load"),
  wechatHotRefresh: () => invokeChannel("wechat-hot:refresh"),
  wechatHotLoadRead: () => invokeChannel("wechat-hot:load-read"),
  wechatHotMarkRead: (
    title: IpcChannelMap["wechat-hot:mark-read"]["args"][0],
  ) => invokeChannel("wechat-hot:mark-read", title),
  onWechatHotUpdated: (cb: Callback<WechatHotPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as WechatHotPayload);
    ipcRenderer.on("wechat-hot:updated", handler);
    return () => ipcRenderer.removeListener("wechat-hot:updated", handler);
  },

  // 电影模块（热映 / 即将上映 / 详情）
  moviesLoad: () => invokeChannel("movies:load"),
  moviesRefresh: (cityId?: IpcChannelMap["movies:refresh"]["args"][0]) =>
    invokeChannel("movies:refresh", cityId),
  moviesDetail: (movieId: IpcChannelMap["movies:detail"]["args"][0]) =>
    invokeChannel("movies:detail", movieId),
  moviesTmdbKeyGet: () => invokeChannel("movies:tmdb-key-get"),
  moviesTmdbKeySet: (key: IpcChannelMap["movies:tmdb-key-set"]["args"][0]) =>
    invokeChannel("movies:tmdb-key-set", key),
  moviesWatchlistList: () => invokeChannel("movies:watchlist-list"),
  moviesWatchlistToggle: (input: IpcChannelMap["movies:watchlist-toggle"]["args"][0]) =>
    invokeChannel("movies:watchlist-toggle", input),
  moviesCinemas: (input: IpcChannelMap["movies:cinemas"]["args"][0]) =>
    invokeChannel("movies:cinemas", input),
  moviesCinemaShows: (input: IpcChannelMap["movies:cinema-shows"]["args"][0]) =>
    invokeChannel("movies:cinema-shows", input),
  moviesCinemaFilters: (input: IpcChannelMap["movies:cinema-filters"]["args"][0]) =>
    invokeChannel("movies:cinema-filters", input),
  onMoviesUpdated: (cb: Callback<MoviesPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as MoviesPayload);
    ipcRenderer.on("movies:updated", handler);
    return () => ipcRenderer.removeListener("movies:updated", handler);
  },

  // 演出票监控（票牛 + 摩天轮场次票价）
  concertsLoad: () => invokeChannel("concerts:load"),
  concertsRefresh: () => invokeChannel("concerts:refresh"),
  concertsAdd: (input: IpcChannelMap["concerts:add"]["args"][0]) =>
    invokeChannel("concerts:add", input),
  concertsRemove: (id: IpcChannelMap["concerts:remove"]["args"][0]) =>
    invokeChannel("concerts:remove", id),
  concertsTiers: (input: IpcChannelMap["concerts:tiers"]["args"][0]) =>
    invokeChannel("concerts:tiers", input),
  concertsSetWatchedTiers: (input: IpcChannelMap["concerts:setWatchedTiers"]["args"][0]) =>
    invokeChannel("concerts:setWatchedTiers", input),
  onConcertsUpdated: (cb: Callback<ConcertsPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as ConcertsPayload);
    ipcRenderer.on("concerts:updated", handler);
    return () => ipcRenderer.removeListener("concerts:updated", handler);
  },

  // IT之家新闻
  ithomeLoadNews: () => invokeChannel("ithome:load-news"),
  ithomeRefreshNews: (dateKey: IpcChannelMap["ithome:refresh-news"]["args"][0]) =>
    invokeChannel("ithome:refresh-news", dateKey),
  ithomeFetchDay: (dateKey: IpcChannelMap["ithome:fetch-day"]["args"][0]) =>
    invokeChannel("ithome:fetch-day", dateKey),
  ithomeFetchArticleBody: (payload: IthomeArticleIdPayload) =>
    invokeChannel("ithome:fetch-article-body", payload),
  ithomeSummarizeArticle: (payload: IthomeSummarizePayload) =>
    invokeChannel("ithome:summarize-article", payload),
  ithomeToggleFavorite: (payload: IthomeArticleIdPayload) =>
    invokeChannel("ithome:toggle-favorite", payload),
  ithomeMarkRead: (id: IpcChannelMap["ithome:mark-read"]["args"][0]) =>
    invokeChannel("ithome:mark-read", id),
  ithomeShareCard: (id: string) =>
    invokeChannel("ithome:share-card", { id }),

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
  fundsList: () => invokeChannel("funds:list"),
  fundsAdd: (input: IpcChannelMap["funds:add"]["args"][0]) =>
    invokeChannel("funds:add", input),
  fundsUpdate: (
    id: IpcChannelMap["funds:update"]["args"][0],
    patch: IpcChannelMap["funds:update"]["args"][1],
  ) => invokeChannel("funds:update", id, patch),
  fundsRemove: (id: IpcChannelMap["funds:remove"]["args"][0]) =>
    invokeChannel("funds:remove", id),
  fundsRestore: (id: IpcChannelMap["funds:restore"]["args"][0]) =>
    invokeChannel("funds:restore", id),
  fundsSearch: (query: IpcChannelMap["funds:search"]["args"][0]) =>
    invokeChannel("funds:search", query),
  fundsBackfill: (code: IpcChannelMap["funds:backfill"]["args"][0]) =>
    invokeChannel("funds:backfill", code),
  fundsNavFetch: () => invokeChannel("funds:nav:fetch"),
  fundsNavFetchCodes: (codes: IpcChannelMap["funds:nav:fetch-codes"]["args"][0]) =>
    invokeChannel("funds:nav:fetch-codes", codes),
  fundsNavState: () => invokeChannel("funds:nav:state"),
  fundsHistoryList: () => invokeChannel("funds:history:list"),
  fundsNavHistory: (
    code: IpcChannelMap["funds:nav:history"]["args"][0],
    opts: IpcChannelMap["funds:nav:history"]["args"][1],
  ) => invokeChannel("funds:nav:history", code, opts),
  fundsIndexHistory: (
    symbol: IpcChannelMap["funds:index:history"]["args"][0],
    opts: IpcChannelMap["funds:index:history"]["args"][1],
  ) => invokeChannel("funds:index:history", symbol, opts),
  fundsSetNavSource: (source: IpcChannelMap["funds:set-nav-source"]["args"][0]) =>
    invokeChannel("funds:set-nav-source", source),
  fundsAlertPrefsGet: () => invokeChannel("funds:alert-prefs:get"),
  fundsAlertPrefsSet: (patch: IpcChannelMap["funds:alert-prefs:set"]["args"][0]) =>
    invokeChannel("funds:alert-prefs:set", patch),
  onFundsNavFetched: (cb: Callback<FundsNavFetchedPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as FundsNavFetchedPayload);
    ipcRenderer.on("funds:nav:fetched", handler);
    return () => ipcRenderer.removeListener("funds:nav:fetched", handler);
  },
  onFundsNavState: (cb: Callback<FundsNavStatePayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as FundsNavStatePayload);
    ipcRenderer.on("funds:nav:state", handler);
    return () => ipcRenderer.removeListener("funds:nav:state", handler);
  },
  onFundsHistoryUpdated: (cb: Callback<FundsHistoryUpdatedPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as FundsHistoryUpdatedPayload);
    ipcRenderer.on("funds:history:updated", handler);
    return () => ipcRenderer.removeListener("funds:history:updated", handler);
  },

  // v2.11 提醒
  remindersList: () => invokeChannel("reminders:list"),
  remindersCreate: (input: IpcChannelMap["reminders:create"]["args"][0]) =>
    invokeChannel("reminders:create", input),
  remindersUpdate: (
    id: IpcChannelMap["reminders:update"]["args"][0]["id"],
    patch: IpcChannelMap["reminders:update"]["args"][0]["patch"],
  ) => invokeChannel("reminders:update", { id, patch }),
  remindersRemove: (id: IpcChannelMap["reminders:remove"]["args"][0]) =>
    invokeChannel("reminders:remove", id),
  remindersMarkDone: (id: IpcChannelMap["reminders:mark-done"]["args"][0]) =>
    invokeChannel("reminders:mark-done", id),
  remindersMarkDismissed: (
    id: IpcChannelMap["reminders:mark-dismissed"]["args"][0],
  ) => invokeChannel("reminders:mark-dismissed", id),
  onRemindersFired: (cb: Callback<ReminderFiredPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as ReminderFiredPayload);
    ipcRenderer.on("reminders:fired", handler);
    return () => ipcRenderer.removeListener("reminders:fired", handler);
  },
  onRemindersOpenModal: (cb: Callback<ReminderOpenModalPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as ReminderOpenModalPayload);
    ipcRenderer.on("reminders:open-modal", handler);
    return () => ipcRenderer.removeListener("reminders:open-modal", handler);
  },

  // v2.11 时间线
  recentList: () => invokeChannel("recent:list"),
  recentPush: (entry: IpcChannelMap["recent:push"]["args"][0]) =>
    invokeChannel("recent:push", entry),
  onRecentUpdated: (cb: Callback<RecentUpdatedPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as RecentUpdatedPayload);
    ipcRenderer.on("recent:updated", handler);
    return () => ipcRenderer.removeListener("recent:updated", handler);
  },

  // v2.12 主进程未捕获错误兜底 (main:error)
  onMainError: (cb: Callback<MainErrorPayload>) =>
    subscribe("main:error", cb),

  // Win 窗口控件: titleBarStyle:'hidden' 隐藏 OS 三键, renderer 画按钮调这里.
  // mac 走 hiddenInset 自带三颗灯, 不调这里.
  windowMinimize: () => invokeChannel("window:minimize"),
  windowToggleMaximize: () => invokeChannel("window:toggle-maximize"),
  windowClose: () => invokeChannel("window:close"),

  // Phase C3: App rollback bridge (C3 功能已退役, 移除)
  // getVersionHistory / rollbackApp / deleteBackup / onVersionHistoryUpdated
  // / onVersionHistoryCountsUpdated IPC 已删除

  // P52: Pulse 自更新 (半自动档: 检测+下载+手动确认安装)
  selfUpdateGetState: () => invokeChannel("self-update:get-state"),
  selfUpdateCheck: () => invokeChannel("self-update:check"),
  selfUpdateInstall: () => invokeChannel("self-update:install"),

  // 选股分析 (阶段一): 筛选 + 搜索
  stocksScreen: (payload: IpcChannelMap["stocks:screen"]["args"][0]) =>
    invokeChannel("stocks:screen", payload),
  stocksSearch: (query: IpcChannelMap["stocks:search"]["args"][0]) =>
    invokeChannel("stocks:search", query),
  // 阶段二: AI 推荐筛选条件 (chatCompletion + 24h 缓存)
  stocksAiAdvise: (payload: IpcChannelMap["stocks:ai-advise"]["args"][0]) =>
    invokeChannel("stocks:ai-advise", payload),
  // 阶段三: 个股多角度分析 + AI 详情
  stocksDetailAngles: (payload: IpcChannelMap["stocks:detail-angles"]["args"][0]) =>
    invokeChannel("stocks:detail-angles", payload),
  stocksDetailAnalyze: (payload: IpcChannelMap["stocks:detail-analyze"]["args"][0]) =>
    invokeChannel("stocks:detail-analyze", payload),
  // ponytail: 2026-07-07 P1-2 — 单条 angle 的本地快速重解读 (不走 LLM)
  stocksAngleRefresh: (payload: IpcChannelMap["stocks:angle-refresh"]["args"][0]) =>
    invokeChannel("stocks:angle-refresh", payload),
  // ponytail 2026-07-18 P0-1 polish #2 — 单条 angle 数据重拉 (走 fetcher, 不是 LLM)
  stocksAngleReload: (payload: IpcChannelMap["stocks:angle-reload"]["args"][0]) =>
    invokeChannel("stocks:angle-reload", payload),
  // 2026-07-07 — 诊断报告导出 PNG (主进程 capturePage + showSaveDialog)
  stocksExportDiagnosisPng: (payload: IpcChannelMap["stocks:export-diagnosis-png"]["args"][0]) =>
    invokeChannel("stocks:export-diagnosis-png", payload),

  // v2.49 Overview + Command Palette (T5/T18): IPC bridge
  versionsCommandSearch: (q: string) =>
    invokeChannel("versions:command-search", { q }),
  // v2.50 (T5): LibraryPage / PageHeader / OverviewEmptyState / CommandPalette
  // 兼容旧 renderer 调用, 实际仍复用唯一的 check-updates IPC 通道.
  versionsRunCheck: () => invokeChannel("check-updates"),

  // v2.80 GitHub 优秀项目收录
  // 第二个参数 token 透传给主进程，用于解除未登录 60 次/小时限流。
  githubFetch: (input: string, token: string = "") =>
    invokeChannel("github:fetch", { input, token }),
  aiParseReadme: (payload: AiReadmeParsePayload) =>
    invokeChannel("ai:parse-readme", payload),
  // Release 更新追踪：抓取某仓库 recent releases
  githubFetchRelease: (input: string, token: string = "") =>
    invokeChannel("github:fetch-release", { input, token }),

  // v2.83 密钥库：明文只在主进程流转，list 只给掩码
  vaultList: () => invokeChannel("vault:list"),
  vaultSet: (input: IpcChannelMap["vault:set"]["args"][0]) =>
    invokeChannel("vault:set", input),
  vaultDelete: (id: IpcChannelMap["vault:delete"]["args"][0]) =>
    invokeChannel("vault:delete", id),
  vaultReveal: (id: IpcChannelMap["vault:reveal"]["args"][0]) =>
    invokeChannel("vault:reveal", id),
  vaultCopy: (id: IpcChannelMap["vault:copy"]["args"][0], fieldLabel?: string) =>
    invokeChannel("vault:copy", id, fieldLabel),
  // 导出为明文 JSON（renderer 二次确认后调用）；导入预览只含掩码
  vaultExport: () => invokeChannel("vault:export"),
  vaultImportLoad: () => invokeChannel("vault:import-load"),
  vaultImportApply: (importId: IpcChannelMap["vault:import-apply"]["args"][0]) =>
    invokeChannel("vault:import-apply", importId),

  // v2.83 AI 设置从密钥库引用 key（主进程解密写入 ai-keys）
  aiUseVaultKey: (payload: IpcChannelMap["ai-sessions:use-vault-key"]["args"][0]) =>
    invokeChannel("ai-sessions:use-vault-key", payload),

  // AI 榜单排名模块 (v2.82): 白名单双通道
  getLeaderboard: (opts: IpcChannelMap["leaderboard:get"]["args"][0]) =>
    invokeChannel("leaderboard:get", opts || {}),
  refreshLeaderboard: (opts: IpcChannelMap["leaderboard:refresh"]["args"][0]) =>
    invokeChannel("leaderboard:refresh", opts || {}),
  rateBudget: () => invokeChannel("leaderboard:rate-budget"),
  // 2026-07-22: 工具栏「导出 CSV」→ 主进程 dialog.showSaveDialog + fs.writeFile
  exportLeaderboardCsv: (
    payload: IpcChannelMap["leaderboard:export-csv"]["args"][0],
  ) => invokeChannel("leaderboard:export-csv", payload),

  // 财经新闻 + 行情 (P0): 7 个主通道 + 2 个推送订阅
  financeRefreshNews: (opts: IpcChannelMap["finance:refresh-news"]["args"][0]) =>
    invokeChannel("finance:refresh-news", opts || {}),
  financeGetNews: (args: IpcChannelMap["finance:get-news"]["args"][0]) =>
    invokeChannel("finance:get-news", args || {}),
  // E2：各分类文章计数（含「全部」）
  financeGetCategories: () => invokeChannel("finance:categories"),
  financeGetArticle: (args: IpcChannelMap["finance:get-article"]["args"][0]) =>
    invokeChannel("finance:get-article", args),
  // 相关推荐（同标签优先 + 同分类补全），详情页列表为空时回退用
  financeGetRelated: (args: IpcChannelMap["finance:get-related"]["args"][0]) =>
    invokeChannel("finance:get-related", args),
  financeRefreshQuotes: (opts: IpcChannelMap["finance:refresh-quotes"]["args"][0]) =>
    invokeChannel("finance:refresh-quotes", opts || {}),
  financeGetQuotes: () => invokeChannel("finance:get-quotes"),
  financeToggleFavorite: (args: IpcChannelMap["finance:toggle-favorite"]["args"][0]) =>
    invokeChannel("finance:toggle-favorite", args),
  financeMarkRead: (args: IpcChannelMap["finance:mark-read"]["args"][0]) =>
    invokeChannel("finance:mark-read", args),
  // 财经新闻 AI 解读（结果缓存到 finance_ai.json）
  financeInterpret: (args: IpcChannelMap["finance:interpret"]["args"][0]) =>
    invokeChannel("finance:interpret", args),
  financeInterpretClear: (args: IpcChannelMap["finance:interpret-clear"]["args"][0]) =>
    invokeChannel("finance:interpret-clear", args),
  // P2：跨新闻聚合洞察
  financeAggregate: (args: IpcChannelMap["finance:aggregate"]["args"][0]) =>
    invokeChannel("finance:aggregate", args || {}),
  onFinanceNewsUpdated: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("finance:news-updated", handler);
    return () => ipcRenderer.removeListener("finance:news-updated", handler);
  },
  onFinanceQuotesUpdated: (cb: Callback) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on("finance:quotes-updated", handler);
    return () => ipcRenderer.removeListener("finance:quotes-updated", handler);
  },
} satisfies
  AppInfoApiContract &
  CoreEventsApiContract &
  ConfigStateApiContract &
  ConfigPortabilityApiContract &
  AiUsageApiContract &
  DiagnosticsApiContract &
  FundsApiContract &
  FinanceApiContract &
  IthomeApiContract &
  AiLeaderboardApiContract &
  StocksApiContract &
  WechatHotApiContract &
  RecentApiContract &
  RemindersApiContract &
  WatchlistApiContract &
  ReleaseNotesApiContract &
  ThemeSyncApiContract &
  SelfUpdateApiContract &
  AiPromptsApiContract &
  SearchApiContract &
  AiTasksApiContract &
  AiSessionsApiContract &
  AiSharedConfigApiContract &
  AiAdviceApiContract &
  AiFeedbackApiContract &
  TokenBudgetApiContract &
  UpdateCheckApiContract &
  VersionsApiContract &
  NavigationPersistenceApiContract &
  UpgradeActionsApiContract &
  MutesApiContract &
  LastOpenedApiContract &
  WindowApiContract &
  OpenUrlApiContract &
  BulkUpgradeApiContract &
  GithubApiContract &
  VaultApiContract &
  DigestApiContract &
  Record<string, unknown>;

// Phase v1: Tray 菜单配置 (主面板内 modal)
// 独立 contextBridge 跟在 metalsApi 后面, 不并入 `api` 因为 spec 把这个当作"用户偏好面板",
// 不属于业务 API 表面 (供未来 power user / 第三方接入复用).
export const pulse = {
  tray: {
    // 渲染端主动通知 main (目前 modal 走 main → renderer 的 open 信号,
    // 这里保留对称 API, 方便未来由 renderer 直接发起).
    openConfig: () => ipcRenderer.send("tray:open-config"),
    closeConfigModal: () => ipcRenderer.send("tray:close-config"),
    getPrefs: () => invokeChannel("tray:get-prefs"),
    savePrefs: (prefs: IpcChannelMap["tray:save-prefs"]["args"][0]) =>
      invokeChannel("tray:save-prefs", prefs),
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
} satisfies { tray: PulseTrayApiContract } & Record<string, unknown>;

// 贵金属 (v2.20.0) — 独立 contextBridge, 跟 funds / reminders / metals 一致
export const metalsApi = {
  list: () => invokeChannel("metals:list"),
  updateConfig: (
    patch: IpcChannelMap["metals:config:update"]["args"][0]["patch"],
  ) => invokeChannel("metals:config:update", { patch }),
  upsertHolding: (
    id: IpcChannelMap["metals:holding:upsert"]["args"][0]["id"],
    holding: IpcChannelMap["metals:holding:upsert"]["args"][0]["holding"],
  ) => invokeChannel("metals:holding:upsert", { id, holding }),
  removeHolding: (id: IpcChannelMap["metals:holding:remove"]["args"][0]["id"]) =>
    invokeChannel("metals:holding:remove", { id }),
  fetchNow: () => invokeChannel("metals:quote:fetch"),
  getState: () => invokeChannel("metals:quote:state"),
  onQuoteChanged: (cb: Callback<MetalQuoteChangedPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as MetalQuoteChangedPayload);
    ipcRenderer.on("metals:quote:changed", handler);
    return () => ipcRenderer.removeListener("metals:quote:changed", handler);
  },
  onStateUpdate: (cb: Callback<MetalStateResponse["scheduler"]>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as MetalStateResponse["scheduler"]);
    ipcRenderer.on("metals:quote:state-changed", handler);
    return () =>
      ipcRenderer.removeListener("metals:quote:state-changed", handler);
  },
  getHistory: () => invokeChannel("metals:history:get"),
  onHistoryChanged: (cb: Callback<{ historyMap?: Record<string, unknown> }>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as { historyMap?: Record<string, unknown> });
    ipcRenderer.on("metals:history:changed", handler);
    return () => ipcRenderer.removeListener("metals:history:changed", handler);
  },

  // P10: 主题切换 IPC 桥接 (顶层 themeSet / onThemeChanged 在 api 上重复暴露,
  // 这里保留方便 theme-manager 之类直接走 metalsApi 的代码).
  themeGet: () => invokeChannel("theme:get"),
  themeSet: (mode: IpcChannelMap["theme:set"]["args"][0]) =>
    invokeChannel("theme:set", mode),
  onThemeChanged: (cb: Callback<ThemeChangedPayload>) => {
    const handler = (_evt: IpcRendererEvent, data: unknown) =>
      cb(data as ThemeChangedPayload);
    ipcRenderer.on("theme:changed", handler);
    return () => ipcRenderer.removeListener("theme:changed", handler);
  },
} satisfies MetalsApiContract & ThemeControlApiContract & Record<string, unknown>;

contextBridge.exposeInMainWorld("platformInfo", platformInfo);
contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("pulse", pulse);
contextBridge.exposeInMainWorld("metalsApi", metalsApi);
