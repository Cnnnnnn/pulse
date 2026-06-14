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

const {
  app,
  BrowserWindow,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Phase B2b: ai-sessions CursorDetector 读 vscdb 用 Node 22.5+ 内置的 node:sqlite.
// 在 app.whenReady() 之前启 flag.
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
const { bootstrapAiUsage } = require("./bootstrap/ai-usage");
const { mainLog, detectLog } = require("./log");
const stateStore = require("./state-store");
const { HttpClient } = require("./http-client");
const fundStore = require("./fund-store");
const { FundScheduler } = require("./fund-scheduler");
const reminders = require("./reminders");
const recentActivity = require("./recent-activity");

const {
  ARCH,
  CONFIG_PATH,
  PROJECT_ROOT,
  loadConfig,
} = require("./bootstrap/config.js");
const {
  loadCategoryConfig,
  classifyUnmappedAppsByLLM,
} = require("./bootstrap/category.js");
const { initAiTasksWiring } = require("./bootstrap/ai-tasks.js");
const {
  startFundScheduler,
  startRemindersScheduler,
  wireRecentActivityListener,
  startAutoCheckTimer,
  makeRefreshLastOpenedAfterCheck,
} = require("./bootstrap/schedulers.js");
const {
  createSender,
  installErrorGuardBridge,
} = require("./bootstrap/send-to-renderer.js");

const httpClient = new HttpClient();

let isQuitting = false;
let pool = null;
let trayMgr = null;
let winMgr = null;
let fundScheduler = null;
let runtimeConfigRef = { current: null };

function getWindow() {
  return winMgr && winMgr.getWindow();
}

const sendToRenderer = createSender({ getWindow });

installErrorGuardBridge(sendToRenderer);

async function bootstrap() {
  const t0 = Date.now();
  const statePath = stateStore.initStateStorePaths();
  mainLog.info(`state store path: ${statePath}`);
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

  // 0) Phase A: 加载 category config (早期注入, 后面 IPC 通道要用到)
  loadCategoryConfig();

  // 0.5) Step B (LLM classify): 启动期同步对未分类的 app 调 LLM
  // runtimeConfig 还没加载, 但 LLM 分类只依赖 config schema. 先用 raw config.
  // 注意: 这一步允许时 LLM 不可用 graceful skip, 不会阻塞启动.
  const earlyConfig = (() => {
    try {
      return loadConfig();
    } catch {
      return null;
    }
  })();
  if (earlyConfig) {
    runtimeConfigRef.current = earlyConfig;
    await classifyUnmappedAppsByLLM(earlyConfig, { stateStore });
  }

  // 1) 单实例锁
  const tLock = Date.now();
  const gotLock =
    process.env.BENCH === "1" ? true : app.requestSingleInstanceLock();
  if (!gotLock) {
    mainLog.warn("single-instance lock failed, quitting");
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    if (winMgr) winMgr.showWindow();
  });
  timings.lock = Date.now() - tLock;

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

  // 4) worker pool
  const tPool = Date.now();
  const workerScript = path.join(
    __dirname,
    "..",
    "workers",
    "detect-worker.js",
  );
  pool = new WorkerPool({
    size: Math.max(2, (os.cpus().length || 4) - 1),
    workerScript,
    workerOpts: { workerData: { arch: ARCH } },
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
  timings.pool = Date.now() - tPool;

  // 5) window
  const tWindow = Date.now();
  winMgr = createWindowManager({
    config: runtimeConfig,
    getIsQuitting: () => isQuitting,
    preloadPath: path.join(PROJECT_ROOT, "preload.js"),
    indexPath: path.join(PROJECT_ROOT, "index.html"),
  });
  winMgr.createWindow();
  mainLog.info(`window created: ${Date.now() - tWindow}ms`);
  timings.window = Date.now() - tWindow;

  // 6) tray
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
    });
    trayMgr.install();
    mainLog.info(`tray installed: ${Date.now() - tTrayStart}ms`);
    timings.tray = Date.now() - tTrayStart;
  } catch (err) {
    mainLog.error(`tray install failed: ${err.message}`);
    timings.tray = Date.now() - tTrayStart;
  }

  // 7) ipc
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
    onCheckComplete: (results) => {
      if (trayMgr) {
        trayMgr.setResults(results);
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
  });
  mainLog.info(`ipc registered`);
  timings.ipc = Date.now() - tIpc;

  // 7.5) AI usage warmup (fire-and-forget) — 让 renderer 进入 AI 用量页时立即有数据
  //      IPC handlers 已在 registerIpcHandlers 里注册, 这里只跑 warmup
  bootstrapAiUsage({
    stateStore: {
      load: stateStore.loadAiUsageSnapshot,
      save: stateStore.saveAiUsageSnapshot,
    },
    storage: require("../ai-sessions/storage"),
    MiniMaxQuotaClient: require("../ai-usage/client").MiniMaxQuotaClient,
    sendToRenderer,
  }, { warmup: true, registerIpc: false });

  // 8) fund + reminders + recent listeners + auto-check timer
  fundScheduler = startFundScheduler({
    httpClient,
    fundStore,
    FundScheduler,
    sendToRenderer,
  });
  startRemindersScheduler({ reminders, getWindow, sendToRenderer });
  wireRecentActivityListener({ recentActivity, sendToRenderer });
  startAutoCheckTimer({
    runtimeConfig,
    pool,
    getWindow,
    trayMgr,
    stateStore,
  });

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
    bootstrap().catch((err) => {
      mainLog.error(`bootstrap failed: ${err.message}`);
      try {
        app.quit();
      } catch {
        /* noop */
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
    }
    mainLog.info("app quitting");
  });
}

module.exports = {
  loadConfig,
  ARCH,
  CONFIG_PATH,
};
