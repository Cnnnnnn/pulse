/**
 * src/main/index.js
 *
 * 主进程入口（spec §6 + 任务约束）:
 *   - 单实例锁 + lifecycle
 *   - worker pool / window / tray / ipc
 *   - 启动时 config + category + AI wiring + 各类 scheduler
 *
 * 编排层 — 业务拆到 ./bootstrap/*.js.
 */

const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

// 旧版 safeStorage 使用 "pulse Safe Storage"；必须在 app.whenReady() 前
// 保持小写 service name，否则旧用户的加密 key 无法解密。
// 详见 https://github.com/electron/electron/issues/45328
if (app && typeof app.setName === "function") {
  try {
    app.setName("pulse");
  } catch {
    /* noop — vitest 环境里 app 可能不可用 */
  }
}

// CursorDetector 读取 vscdb 依赖 node:sqlite，必须在 app.whenReady() 前启用。
try {
  if (
    app &&
    app.commandLine &&
    typeof app.commandLine.appendSwitch === "function"
  ) {
    app.commandLine.appendSwitch("experimental-sqlite");
  }
} catch {
  /* noop — vitest load-smoke 环境里 app 是 undefined */
}

const { WorkerPool } = require("../workers/pool");
const { createWindowManager } = require("./window");
const { createTrayManager } = require("./tray");
const { registerIpcHandlers } = require("./ipc");
const { createSearchIndex } = require("./search/search-index");
const { registerSearchIpc } = require("./ipc/register-search");
const { startDailySummaryJob } = require("./digest/daily-summary-job");
const { bootstrapAiUsage } = require("./bootstrap/ai-usage");
const {
  initStateRecovery,
  takeRecoveryEvent,
} = require("./bootstrap/state-init");
const { initErrorCapture } = require("./bootstrap/error-init");
const { mainLog, detectLog } = require("./log.ts");
const stateStore = require("./state-store");
const aiStorage = require("../ai-sessions/storage");
const { HttpClient } = require("./http-client.ts");
const { computePoolSize } = require("./pool-size.ts");
const { auditTimers, clearAllManaged } = require("./timer-registry.ts");
const { markBootstrapDone } = require("./diagnostics.ts");
const fundStore = require("./funds/fund-store");
const { FundScheduler } = require("./funds/fund-scheduler");
const {
  registerMetalIpc,
  startMetalScheduler,
  stopMetalScheduler,
} = require("./metal-ipc.js");
const reminders = require("./reminders");
const recentActivity = require("./recent-activity");
const goalWatcher = require("./worldcup/goal-watcher");

const {
  ARCH,
  CONFIG_PATH,
  PROJECT_ROOT,
  loadConfig,
} = require("./bootstrap/config.js");
const {
  loadCategoryConfig,
  classifyUnmappedAppsByLLM,
  primeLLMCacheFromDisk,
} = require("./bootstrap/category.js");
const { initAiTasksWiring } = require("./bootstrap/ai-tasks.js");
const {
  startFundScheduler,
  startRemindersScheduler,
  startWorldcupGoalWatcher,
  wireRecentActivityListener,
  startAutoCheckTimer,
  makeRefreshLastOpenedAfterCheck,
  startSelfUpdateTimer,
  startLeaderboardScheduler,
} = require("./bootstrap/schedulers.js");
const {
  createSender,
  installErrorGuardBridge,
} = require("./bootstrap/send-to-renderer.js");
const {
  setTrayManager: registerTrayManager,
} = require("./bootstrap/tray-init.js");
const { installNintendoImageHeaders } = require("./games/nintendo-image-headers.js");

const httpClient = new HttpClient();

let isQuitting = false;
let pool = null;
let trayMgr = null;
let winMgr = null;
let fundScheduler = null;
let aiUsageScheduler = null;
let runtimeConfigRef = { current: null };

function getWindow() {
  return winMgr && winMgr.getWindow();
}

const sendToRenderer = createSender({ getWindow });

installErrorGuardBridge(sendToRenderer);

/**
 * Bootstrap 子阶段: 启动自更新 timer + 注册 tray 推送.
 *
 * @param {{getTrayMgr: () => object|null}} ctx
 * @returns {{ handle: object|null }} selfUpdateHandle (IPC handler 需读 controller)
 */
function initSelfUpdateTimer(ctx) {
  let selfUpdateHandle = null;
  try {
    selfUpdateHandle = startSelfUpdateTimer({
      // 周期检查仅在系统空闲时运行；手动检查不受限。
      getPowerIdleState: () => {
        try {
          const { powerMonitor } = require("electron");
          if (
            powerMonitor &&
            typeof powerMonitor.getSystemIdleState === "function"
          ) {
            return powerMonitor.getSystemIdleState(120);
          }
          return null;
        } catch {
          return null;
        }
      },
      logSkip: (reason) =>
        mainLog.info(`[self-update] 6h tick skipped (${reason})`),
    });
  } catch (err) {
    mainLog.warn(`[self-update] bootstrap failed: ${err && err.message}`);
  }

  function pushSelfUpdateToTray() {
    try {
      const tray = ctx.getTrayMgr();
      if (tray && selfUpdateHandle && selfUpdateHandle.controller) {
        tray.setSelfUpdateState(selfUpdateHandle.controller.getState());
      }
    } catch (err) {
      mainLog.warn(`[self-update] push to tray failed: ${err && err.message}`);
    }
  }
  setTimeout(pushSelfUpdateToTray, 35000);
  setInterval(pushSelfUpdateToTray, 5 * 60 * 1000);
  return { handle: selfUpdateHandle };
}

/**
 * Bootstrap 子阶段: category config + 历史缓存注入 + LLM 分类 fire-and-forget.
 */
function initCategoryAndLlm() {
  loadCategoryConfig();

  // 历史 cache 必须同步注入，保证首屏分类可用。
  primeLLMCacheFromDisk({ stateStore });

  // LLM 分类保持 fire-and-forget，避免阻塞启动。
  const earlyConfig = (() => {
    try {
      return loadConfig();
    } catch {
      return null;
    }
  })();
  if (earlyConfig) {
    runtimeConfigRef.current = earlyConfig;
    classifyUnmappedAppsByLLM(earlyConfig, { stateStore }).catch((err) => {
      mainLog.warn(`[bootstrap] LLM classify rejected: ${err && err.message}`);
    });
  }
}

/**
 * Bootstrap 子阶段: 单实例锁. 拿不到就 app.quit() 退出.
 * @returns {boolean} 是否拿到锁 (false 时 caller 应直接 return)
 */
function acquireSingleInstanceLock() {
  const tLock = Date.now();
  const gotLock =
    process.env.BENCH === "1" ? true : app.requestSingleInstanceLock();
  if (!gotLock) {
    mainLog.warn("single-instance lock failed, quitting");
    app.quit();
    return { gotLock: false, ms: 0 };
  }
  app.on("second-instance", () => {
    if (winMgr) winMgr.showWindow();
  });
  return { gotLock: true, ms: Date.now() - tLock };
}

/**
 * Bootstrap 子阶段: 启动 worker pool + onProgress/onLog 钩子.
 * @returns {{ ms: number }}
 */
function initWorkerPool() {
  const tPool = Date.now();
  const workerScript = path.join(
    __dirname,
    "..",
    "workers",
    "detect-worker.js",
  );
  const poolSize = computePoolSize();
  pool = new WorkerPool({
    size: poolSize,
    workerScript,
    workerOpts: { workerData: { arch: ARCH, platform: process.platform } },
    onProgress: (payload) => {
      const w = getWindow();
      if (w && !w.isDestroyed()) {
        w.webContents.send("check-progress", payload);
      }
    },
    onLog: (level, text, id, meta) => {
      const m =
        meta && typeof meta === "object" ? { wid: id, ...meta } : { wid: id };
      if (text) m.note = text;
      detectLog._write(level || "INFO", "", m);
    },
  });
  pool.start();
  mainLog.info(`worker pool started: size=${pool.size}`);
  return { ms: Date.now() - tPool };
}

/**
 * Bootstrap 子阶段: 创建主窗口 + 推 recovery event.
 * @param {object} runtimeConfig
 * @returns {{ ms: number }}
 */
function createMainWindow(runtimeConfig) {
  const tWindow = Date.now();
  winMgr = createWindowManager({
    config: runtimeConfig,
    getIsQuitting: () => isQuitting,
    preloadPath: path.join(PROJECT_ROOT, "dist", "preload.js"),
    indexPath: path.join(PROJECT_ROOT, "index.html"),
  });
  winMgr.createWindow();
  // 等 renderer 开始加载后再推送一次恢复事件。
  setImmediate(() => {
    const evt = takeRecoveryEvent();
    if (!evt) return;
    sendToRenderer("state:recovered", evt);
    mainLog.info(
      `state.json recovery pushed to renderer: reason=${evt.reason} backup=${evt.backup || "(none)"}`,
    );
  });
  return { ms: Date.now() - tWindow };
}

/**
 * Bootstrap 子阶段: tray 安装. 大量回调闭包 winMgr/getWindow, 必须在 window 之后.
 * @returns {{ ms: number }}
 */
function installTray() {
  const tTrayStart = Date.now();
  try {
    trayMgr = createTrayManager({
      getConfig: () => runtimeConfigRef.current || { apps: [] },
      getConfigPath: () => CONFIG_PATH,
      onCheck: () => {
        const w = getWindow();
        if (w && !w.isDestroyed()) w.webContents.send("start-check");
      },
      onOpenPanel: () => winMgr && winMgr.showWindow(),
      onQuit: () => {
        isQuitting = true;
        app.quit();
      },
      onFocusUpdate: (data) => {
        if (winMgr) winMgr.showWindow();
        const w = getWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send("tray:focus", {
            tab: "versions",
            rowName: data && data.rowName,
            action: data && data.action,
          });
        }
      },
      onFocusWorldcup: (data) => {
        if (winMgr) winMgr.showWindow();
        const w = getWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send("worldcup:focus-match", {
            matchKey: data && data.matchKey,
          });
        }
      },
      onThemeChange: (mode) => {
        const w = getWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send("theme:changed", { mode, source: "tray" });
        }
      },
      onOpenTrayConfig: () => {
        if (winMgr) winMgr.showWindow();
        const w = getWindow();
        if (w && !w.isDestroyed()) {
          try {
            w.show();
          } catch {
            /* noop */
          }
          try {
            w.focus();
          } catch {
            /* noop */
          }
          try {
            w.webContents.send("tray:open-config");
          } catch {
            /* noop */
          }
        }
      },
    });
    trayMgr.install();
    registerTrayManager(trayMgr);
    try {
      trayMgr.setTrayMenuPrefs(stateStore.loadTrayMenuPrefs());
    } catch (err) {
      mainLog.warn(`tray menu prefs load failed: ${err && err.message}`);
    }
    mainLog.info(`tray installed: ${Date.now() - tTrayStart}ms`);
  } catch (err) {
    mainLog.error(`tray install failed: ${err.message}`);
  }
  return { ms: Date.now() - tTrayStart };
}

/**
 * Bootstrap 子阶段: AI 用量 cache + 30min 自动刷新 scheduler.
 */
function initAiUsageTray() {
  aiUsageScheduler = null;
  try {
    const { createAiUsageCache } = require("./ai-usage-cache");
    const {
      createAiUsageRefreshScheduler,
    } = require("./ai-usage-refresh-scheduler");
    const aiUsageCache = createAiUsageCache({});
    if (trayMgr) {
      trayMgr.setAiUsage({
        minimax: aiUsageCache.getTraySummary("minimax"),
        glm: aiUsageCache.getTraySummary("glm"),
      });
    }
    mainLog.info("ai-usage tray initialized (read-only from state.json)");

    aiUsageScheduler = createAiUsageRefreshScheduler({
      trayMgr,
      getConfig: () => runtimeConfigRef.current,
      sendToRenderer: require("./bootstrap/send-to-renderer").sendToRenderer,
      deps: {
        stateStore: {
          loadSnapshotProvider: stateStore.loadAiUsageSnapshotProvider,
          saveSnapshotProvider: stateStore.saveAiUsageSnapshotProvider,
          loadHistoryProvider: stateStore.loadAiUsageHistoryProvider,
          appendHistoryProvider: stateStore.appendAiUsageHistoryDayProvider,
        },
        storage: {
          loadApiKey: (pid) => {
            try {
              return aiStorage.loadApiKey(pid);
            } catch {
              return null;
            }
          },
        },
        MiniMaxQuotaClient: require("../ai-usage/client").MiniMaxQuotaClient,
        GlmQuotaClient: require("../ai-usage/client-glm").GlmQuotaClient,
        pushEvent: () => {},
      },
      alertDeps: {
        providers: ["minimax", "glm"],
        loadHistoryProvider: stateStore.loadAiUsageHistoryProvider,
        loadAlertPrefs: stateStore.loadAiUsageAlertPrefs,
        saveAlertPrefs: stateStore.saveAiUsageAlertPrefs,
        listTasks: async (dateKey) => {
          const wiring = global.__pulse_aiTasks;
          if (!wiring || !wiring.engine) return { tasks: [] };
          return wiring.engine.listTasks(dateKey);
        },
      },
    });
    aiUsageScheduler.start({ intervalMs: 30 * 60 * 1000, deferInitial: true });
    mainLog.info("ai-usage tray refresh scheduler started (every 30min)");
  } catch (err) {
    mainLog.warn(`ai-usage tray init failed: ${err && err.message}`);
  }
}

/**
 * Bootstrap 子阶段: 世界杯 tray cache (从 state.json 读, 不主动 fetch).
 * @returns {() => void}
 */
function initWorldcupTray() {
  let pushWorldcupToTray = () => {};
  try {
    const { createWorldcupTrayCache } = require("./worldcup-tray-cache");
    const worldcupCache = createWorldcupTrayCache({});
    pushWorldcupToTray = () => {
      if (!trayMgr) return;
      const today = worldcupCache.getTodayLive();
      const upcoming = worldcupCache.getUpcoming(3);
      trayMgr.setWorldcup({
        todayMatches: today.ok ? today.matches : [],
        upcoming: upcoming.ok ? upcoming.matches : [],
        ts: today.ts || (upcoming.ok ? upcoming.ts : null),
      });
    };
    pushWorldcupToTray();
    mainLog.info("worldcup tray initialized (read-only from state.json)");
  } catch (err) {
    mainLog.warn(`worldcup tray init failed: ${err && err.message}`);
  }
  return pushWorldcupToTray;
}

/**
 * Bootstrap 子阶段: 贵金属 tray (从 metal-ipc 模块级 cache 读 quoteCache).
 */
function initMetalsTray() {
  try {
    const { getTraySnapshot: getMetalsTraySnapshot } = require("./metal-ipc");
    function pushMetalsToTray() {
      if (!trayMgr) return;
      const snap = getMetalsTraySnapshot();
      trayMgr.setMetals(snap);
    }
    pushMetalsToTray();
    mainLog.info("metals tray initialized (live quoteCache)");

    const METALS_TRAY_REFRESH_MS = 60 * 1000;
    const metalsTrayTimer = setInterval(
      pushMetalsToTray,
      METALS_TRAY_REFRESH_MS,
    );
    app.once("before-quit", () => {
      try {
        clearInterval(metalsTrayTimer);
      } catch {
        /* noop */
      }
    });
  } catch (err) {
    mainLog.warn(`metals tray init failed: ${err && err.message}`);
  }
}

/**
 * Bootstrap 子阶段: 注册全部 IPC handler (主 IPC + search + daily digest).
 * @param {object} selfUpdateHandle - self-update controller, IPC handler 读
 * @returns {{ ms: number }}
 */
function registerAllIpc(selfUpdateHandle) {
  const tIpc = Date.now();
  const refreshLastOpenedAfterCheck = makeRefreshLastOpenedAfterCheck({
    runtimeConfigRef,
    stateStore,
    sendToRenderer,
  });

  registerIpcHandlers({
    getConfig: () => runtimeConfigRef.current,
    pool,
    getWindow,
    getCachedState: () => stateStore.load(),
    onCheckComplete: (results, staleNames) => {
      if (trayMgr) {
        trayMgr.setResults(results, staleNames);
        const count = results.filter((r) => r.has_update).length;
        trayMgr.setBadge(count);
      }
      try {
        stateStore.saveAll(results);
      } catch (err) {
        mainLog.warn(`state save failed: ${err.message}`);
      }
      refreshLastOpenedAfterCheck();
    },
    getFundScheduler: () => fundScheduler,
    getSelfUpdateController: () =>
      selfUpdateHandle && selfUpdateHandle.controller
        ? selfUpdateHandle.controller
        : null,
  });
  mainLog.info(`ipc registered`);

  // A3: 全文搜索 — 启动构建索引 + 注册 IPC + 注入各模块 setter (实时 upsert)
  try {
    const searchIndex = createSearchIndex();
    registerSearchIpc({ ipcMain, searchIndex, stateStore });
    const { registerReleaseNotes } = require("./release-notes");
    registerReleaseNotes({ ipcMain, app });
    stateStore.setSearchIndex(searchIndex);
    reminders.setSearchIndex(searchIndex);
    require("./ithome/news-store").setSearchIndex(searchIndex);
    // ponytail: Q4 v2 — 索引构建延后, 不阻塞 window load / markBootstrapDone
    setImmediate(() => {
      try {
        const tSearch = Date.now();
        searchIndex.buildFromState(stateStore.load());
        mainLog.info(
          `search index built (deferred): ${searchIndex.size()} docs in ${Date.now() - tSearch}ms`,
        );
      } catch (err) {
        mainLog.warn(`[search] deferred build failed: ${err && err.message}`);
      }
    });
  } catch (err) {
    mainLog.warn(`search index init failed: ${err && err.message}`);
  }

  // Phase I5: start daily digest scheduler. setInterval(60s) ticks; the job
  // gates on enabled + last_push_date. We use setInterval so the bootstrap
  // completes immediately without waiting for the first tick.
  try {
    startDailySummaryJob({
      getState: () => {
        try {
          return stateStore.load() || {};
        } catch {
          return {};
        }
      },
      setState: (partial) => {
        try {
          if (partial && partial.daily_digest) {
            stateStore.saveDailyDigest(partial.daily_digest);
          }
        } catch (err) {
          mainLog.warn(
            `[digest] saveDailyDigest failed: ${err && err.message}`,
          );
        }
      },
      getConfig: () =>
        runtimeConfigRef.current || { apps: [], notifications: {} },
      sendNotification: (n) => {
        try {
          const { Notification: ElectronNotification } = require("electron");
          if (
            !ElectronNotification.isSupported ||
            !ElectronNotification.isSupported()
          ) {
            mainLog.warn(
              "[digest] notification not supported on this platform",
            );
            return;
          }
          const note = new ElectronNotification({
            title: n.title,
            body: n.body,
            silent: false,
          });
          note.on("click", () => {
            try {
              if (winMgr) winMgr.showWindow();
              const w = getWindow();
              if (w && !w.isDestroyed())
                w.webContents.send("digest:open", {
                  date: new Date().toISOString().slice(0, 10),
                });
            } catch (err) {
              mainLog.warn(
                `[digest] notification click failed: ${err && err.message}`,
              );
            }
          });
          note.show();
        } catch (err) {
          mainLog.warn(
            `[digest] sendNotification threw: ${err && err.message}`,
          );
        }
      },
    });
    mainLog.info("daily digest job started");
  } catch (err) {
    mainLog.warn(`[digest] job bootstrap failed: ${err && err.message}`);
  }
  return { ms: Date.now() - tIpc };
}

/**
 * Bootstrap 子阶段: 启动 metals IPC + scheduler + ai-usage warmup +
 * fund/reminders/worldcup/recent/auto-check timer.
 * 步骤 7.4 / 7.5 / 8. pushWorldcupToTray 由 initWorldcupTray 返回, 钩给 goal-watcher.
 */
function startSchedulers(pushWorldcupToTray) {
  // 必须在 renderer 可能 invoke metals:* 前同步注册 IPC。
  registerMetalIpc();
  startMetalScheduler({
    getConfig: () => runtimeConfigRef.current,
    onUpdateTray: () => {
      if (!trayMgr) return;
      try {
        const {
          getTraySnapshot: getMetalsTraySnapshot,
        } = require("./metal-ipc");
        trayMgr.setMetals(getMetalsTraySnapshot());
      } catch (err) {
        /* noop */
      }
    },
  });

  // 延后 AI usage warmup，避免阻塞 bootstrap 同步段。
  setImmediate(() => {
    bootstrapAiUsage(
      {
        stateStore: {
          loadSnapshotProvider: stateStore.loadAiUsageSnapshotProvider,
          saveSnapshotProvider: stateStore.saveAiUsageSnapshotProvider,
          loadHistoryProvider: stateStore.loadAiUsageHistoryProvider,
          appendHistoryProvider: stateStore.appendAiUsageHistoryDayProvider,
        },
        storage: require("../ai-sessions/storage"),
        MiniMaxQuotaClient: require("../ai-usage/client").MiniMaxQuotaClient,
        GlmQuotaClient: require("../ai-usage/client-glm").GlmQuotaClient,
        sendToRenderer,
      },
      { warmup: true, registerIpc: false },
    );
  });

  fundScheduler = startFundScheduler({
    httpClient,
    fundStore,
    FundScheduler,
    sendToRenderer,
    getConfig: () => runtimeConfigRef.current,
  });
  startRemindersScheduler({ reminders, getWindow, sendToRenderer });
  startWorldcupGoalWatcher({
    getWindow,
    sendToRenderer,
    getConfig: () => runtimeConfigRef.current,
    goalWatcher,
    onScoresChanged: (newScores) => {
      pushWorldcupToTray();
      try {
        const keys =
          newScores && Array.isArray(newScores._updatedKeys)
            ? newScores._updatedKeys
            : null;
        sendToRenderer("worldcup:scores-updated", {
          ts: Date.now(),
          updatedKeys: keys,
        });
      } catch (err) {
        mainLog.warn(
          `[worldcup] push scores to renderer failed: ${err && err.message}`,
        );
      }
    },
  });
  wireRecentActivityListener({ recentActivity, sendToRenderer });
  startAutoCheckTimer({
    runtimeConfigRef,
    pool,
    getWindow,
    trayMgr,
    stateStore,
  });
  // AI 榜单每日同步（启动延迟预暖 + 每日拉取；graceful）
  startLeaderboardScheduler({});
}

async function bootstrap() {
  const t0 = Date.now();
  const statePath = stateStore.initStateStorePaths();
  mainLog.info(`state store path: ${statePath}`);

  const ctx = { getTrayMgr: () => trayMgr };

  // IPC 注册时读取 self-update controller，因此必须先初始化。
  const { handle: selfUpdateHandle } = initSelfUpdateTimer(ctx);

  try {
    initErrorCapture({ sendToRenderer });
    mainLog.info("error capture enabled");
  } catch (err) {
    mainLog.warn(`[error-init] failed: ${err && err.message}`);
  }
  // 必须先恢复 state，后续模块才能读取可靠基线。
  initStateRecovery();
  try {
    const st = fs.statSync(statePath);
    if (st && st.size > 5 * 1024 * 1024) {
      mainLog.warn(
        `[db-health] state.json size=${(st.size / 1024 / 1024).toFixed(2)}MB exceeds 5MB threshold. ` +
          `Consider splitting large collection fields into separate files (see docs/db-migration-assessment.md).`,
      );
    }
  } catch {
    /* ENOENT 等不阻塞启动 */
  }
  mainLog.info(
    `boot pid=${process.pid} arch=${ARCH} platform=${process.platform}`,
  );

  const timings = {
    lock: 0,
    config: 0,
    pool: 0,
    window: 0,
    tray: 0,
    ipc: 0,
    total: 0,
  };

  initCategoryAndLlm();

  // 1) 单实例锁
  const lockResult = acquireSingleInstanceLock();
  if (!lockResult.gotLock) return;
  timings.lock = lockResult.ms;

  // 2) config (再读一次以保证最新; 早期读是给 LLM 用)
  const tConfig = Date.now();
  const runtimeConfig = loadConfig();
  runtimeConfigRef.current = runtimeConfig;
  mainLog.info(
    `config loaded: ${(runtimeConfig.apps || []).length} apps, check_on_launch=${runtimeConfig.check_on_launch}`,
  );
  timings.config = Date.now() - tConfig;

  // 2.5) AI 任务总结 wiring
  initAiTasksWiring({ stateStore });

  // 3) dock 隐藏
  try {
    if (process.env.PULSE_HIDE_DOCK === "1") {
      app.dock.hide();
    }
  } catch {
    /* noop */
  }

  // 3.5) Nintendo 封面 UA 改写（须在创建窗口前）
  try {
    installNintendoImageHeaders(session && session.defaultSession);
  } catch {
    /* noop — vitest load-smoke 环境里 session 可能不可用 */
  }

  // 4) worker pool
  const poolOut = initWorkerPool();
  timings.pool = poolOut.ms;

  // 5) window
  const windowOut = createMainWindow(runtimeConfig);
  mainLog.info(`window created: ${windowOut.ms}ms`);
  timings.window = windowOut.ms;

  // 6) tray
  const trayOut = installTray();
  timings.tray = trayOut.ms;

  // 6.5) ai-usage tray
  initAiUsageTray();

  // 6.6) worldcup tray (返回 pushWorldcupToTray 给 goal-watcher 复用)
  const pushWorldcupToTray = initWorldcupTray();

  // 6.7) metals tray
  initMetalsTray();

  // 7) ipc
  const ipcOut = registerAllIpc(selfUpdateHandle);
  timings.ipc = ipcOut.ms;

  // 7.4 + 7.5 + 8) schedulers
  startSchedulers(pushWorldcupToTray);

  // 启动埋点
  timings.total = Date.now() - t0;
  mainLog.event({
    tray: `${timings.tray}ms`,
    window: `${timings.window}ms`,
    total: `${timings.total}ms`,
    apps: (runtimeConfig.apps || []).length,
  });
}

if (app && typeof app.whenReady === "function") {
  app.whenReady().then(() => {
    try {
      const audit = auditTimers(
        path.join(__dirname, "..", "tests", "fixtures", "timer-audit"),
        { logger: mainLog },
      );
      mainLog.info(
        `[timer-registry] startup audit summary: total=${audit.total} clean=${audit.clean} orphan=${audit.orphan} debounce=${audit.debounce} dupSchedule=${audit.dupSchedule}`,
      );
    } catch (err) {
      mainLog.warn(
        `[timer-registry] startup audit failed: ${err && err.message}`,
      );
    }

    // lifecycle handler 依赖 bootstrap 初始化的闭包状态。
    bootstrap()
      .then(() => {
        markBootstrapDone();
      })
      .catch((err) => {
        mainLog.error(`bootstrap failed: ${err.message}`);
        try {
          app.quit();
        } catch {
          /* noop */
        }
      });

    app.once("before-quit", () => {
      try {
        const cleared = clearAllManaged();
        if (cleared > 0) {
          mainLog.info(
            `[timer-registry] before-quit cleared ${cleared} managed timer(s)`,
          );
        }
      } catch (err) {
        mainLog.warn(
          `[timer-registry] before-quit clearAllManaged failed: ${err && err.message}`,
        );
      }
    });
  });

  app.on("window-all-closed", () => {
    // macOS: 不退出
  });

  app.on("activate", () => {
    if (winMgr) {
      winMgr.showWindow();
    } else {
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) {
        const w = wins[0];
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
        if (process.platform === "darwin") {
          try {
            w.moveTop();
          } catch {
            /* noop */
          }
        }
      }
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (pool) {
      try {
        pool.stop();
      } catch {
        /* noop */
      }
    }
    if (trayMgr) {
      try {
        trayMgr.dispose();
      } catch {
        /* noop */
      }
      try {
        registerTrayManager(null);
      } catch {
        /* noop */
      }
    }
    try {
      stopMetalScheduler();
    } catch {
      /* noop */
    }
    if (aiUsageScheduler) {
      try {
        aiUsageScheduler.stop();
      } catch {
        /* noop */
      }
    }
    mainLog.info("app quitting");
  });
}

module.exports = {
  loadConfig,
  ARCH,
  CONFIG_PATH,
};
