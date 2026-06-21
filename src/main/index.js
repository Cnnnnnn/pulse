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

const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

// safeStorage 兼容性: 早期版本 Pulse (npm 包的 name="pulse") 用小写
// "pulse Safe Storage" 作为 keychain service name, 老用户 .bin 加密文件绑了
// 那个 service 下的 master key. 现在 productName="Pulse" → Electron 默认走
// 大写 "Pulse Safe Storage" → 拿到的 master key 跟老文件不兼容, decrypt
// 失败, 看起来 "deepseek/minimax 正常, GLM 异常" 其实是全部都 decrypt 失败
// (UI 走 hasFile 兜底让状态栏误显 "已存 key").
//
// 强制设回小写 "pulse" 保持兼容, 必须在 app.whenReady() 之前调才能影响
// safeStorage 用的 service name (Electron 内部 cache).
// 详见 https://github.com/electron/electron/issues/45328
if (app && typeof app.setName === "function") {
  try {
    app.setName("pulse");
  } catch {
    /* noop — vitest 环境里 app 可能不可用 */
  }
}

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
const { startDailySummaryJob } = require("./digest/daily-summary-job");
const { bootstrapAiUsage } = require("./bootstrap/ai-usage");
const { initStateRecovery, takeRecoveryEvent } = require("./bootstrap/state-init");
const { initErrorCapture } = require("./bootstrap/error-init");
const { mainLog, detectLog } = require("./log");
const stateStore = require("./state-store");
const aiStorage = require("../ai-sessions/storage");
const { HttpClient } = require("./http-client");
const { computePoolSize } = require("./pool-size");
const { auditTimers, clearAllManaged } = require("./timer-registry");
const fundStore = require("./fund-store");
const { FundScheduler } = require("./fund-scheduler");
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
  // Phase Q6: capture uncaught main errors + best-effort cleanup of old logs
  try {
    initErrorCapture({ sendToRenderer });
    mainLog.info("error capture enabled");
  } catch (err) {
    mainLog.warn(`[error-init] failed: ${err && err.message}`);
  }
  // Phase Q8: run loadOrRecover to back up any corrupt state.json and record
  // the recovery event for the renderer's banner. Must happen before any other
  // module reads state, so they see the baseline (not corrupt data).
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

  // 0) Phase A: 加载 category config (早期注入, 后面 IPC 通道要用到)
  loadCategoryConfig();

  // 0.4) Step B-prime (v2.16): 同步从 disk 注入历史 LLM cache.
  //       关键: 这步必须同步, 跟 fire-and-forget 的 LLM 推理分开.
  //       否则 fire-and-forget 会让旧 cache 也延后注入, 回归.
  //       (历史分类 < 100ms 同步读盘, 用户感知不到, 但能让首屏 tabs 立即看到正确分类)
  primeLLMCacheFromDisk({ stateStore });

  // 0.5) Step B (LLM classify): 启动期 fire-and-forget 后台跑.
  // 之前: await — 阻塞 bootstrap, 最坏 28s 等 ollama qwen2.5-coder:7b.
  // 修法: 立即返, 后台跑; 完成时调 setLLMCache + save, 之后所有 getCategory 调用
  //      立即看到正确分类 (LLM_CLASSIFY_CACHE 是 module-level Map, 写入即生效).
  // 权衡: 用户启动后立即切 category tab 时, 未分类 app 会落 'other' (兜底);
  //       0-28s 后 LLM 跑完, 下次 IPC (get-config / check-updates / 切 tab) 触发的
  //       getCategory 会拿到正确分类. 用户感知: 不再"卡 28s 才看到首屏".
  //       (后续可增强: LLM 完成时推 'category:updated' IPC 让 renderer 主动重算 tabs)
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
  // [v2.16] pool size 走 cap=4 (抽到 src/main/pool-size.js 测)
  // 8 核机器上 cpus-1=7 浪费, 13 个 app 跑 detect 链 (app 间并行) 用不到 7 个 worker.
  // 实测启动节省 ~50-100ms (少 spawn 3 个 worker, 每个 init V8 + require chain ~20ms).
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
  // Phase Q8: if a recovery event was recorded, push it to the renderer once
  // the window is alive. Use setImmediate to let the renderer load before push.
  setImmediate(() => {
    const evt = takeRecoveryEvent();
    if (!evt) return;
    sendToRenderer("state:recovered", evt);
    mainLog.info(
      `state.json recovery pushed to renderer: reason=${evt.reason} backup=${evt.backup || "(none)"}`,
    );
  });
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
      // v2.22 Task A3: 菜单栏升级行点击 → 显示面板 + 推 tray:focus 事件
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
      // v2.22 Task C3: 菜单栏世界杯行点击 → 显示面板 + 推 worldcup:focus-match
      // 复用现有 WorldcupLayout 监听的 worldcup:focus-match IPC, 不新增通道.
      onFocusWorldcup: (data) => {
        if (winMgr) winMgr.showWindow();
        const w = getWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send("worldcup:focus-match", { matchKey: data && data.matchKey });
        }
      },
    });
    trayMgr.install();
    mainLog.info(`tray installed: ${Date.now() - tTrayStart}ms`);
    timings.tray = Date.now() - tTrayStart;
  } catch (err) {
    mainLog.error(`tray install failed: ${err.message}`);
    timings.tray = Date.now() - tTrayStart;
  }

  // 6.5) v2.22 Task B2 + B2.1: AI 用量 cache + 30min 自动刷新
  // B2: 启动时从 state.json 读 last-known 推 tray
  // B2.1: 30min setInterval 调 register-ai-usage._internals.fetch (双 provider),
  //       写回 state.json 后重新构造 tray summary 推 tray.
  // Tray 不依赖 IPC 通道 — 走模块级 state.json + ai-usage-cache.
  let aiUsageScheduler = null;
  try {
    const { createAiUsageCache } = require("./ai-usage-cache");
    const { createAiUsageRefreshScheduler } = require("./ai-usage-refresh-scheduler");
    const aiUsageCache = createAiUsageCache({});
    if (trayMgr) {
      trayMgr.setAiUsage({
        minimax: aiUsageCache.getTraySummary("minimax"),
        glm: aiUsageCache.getTraySummary("glm"),
      });
    }
    mainLog.info("ai-usage tray initialized (read-only from state.json)");

    // B2.1: 30min 自动刷新 — 复用 register-ai-usage 的 deps (跟 IPC 通道同源)
    aiUsageScheduler = createAiUsageRefreshScheduler({
      trayMgr,
      deps: {
        stateStore: {
          loadSnapshotProvider: stateStore.loadAiUsageSnapshotProvider,
          saveSnapshotProvider: stateStore.saveAiUsageSnapshotProvider,
          loadHistoryProvider: stateStore.loadAiUsageHistoryProvider,
          appendHistoryProvider: stateStore.appendAiUsageHistoryDayProvider,
        },
        storage: {
          loadApiKey: (pid) => {
            try { return aiStorage.loadApiKey(pid); } catch { return null; }
          },
        },
        MiniMaxQuotaClient: require("../ai-usage/client").MiniMaxQuotaClient,
        GlmQuotaClient: require("../ai-usage/client-glm").GlmQuotaClient,
        pushEvent: () => {}, // tray refresh 不需要推 renderer (renderer 走自己的 IPC)
      },
    });
    aiUsageScheduler.start({ intervalMs: 30 * 60 * 1000 });
    mainLog.info("ai-usage tray refresh scheduler started (every 30min)");
  } catch (err) {
    mainLog.warn(`ai-usage tray init failed: ${err && err.message}`);
  }

  // 6.6) v2.22 Task C2: 世界杯 tray cache (从 state.json 读 today/upcoming, 不主动 fetch)
  // v2.22 Task C2.1: pushWorldcupToTray hoist 到 try 块外, 让后面的 startWorldcupGoalWatcher
  //   能通过 onScoresChanged 钩进来 — 替换之前的 60s setInterval 轮询.
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

  // 6.7) v2.22 Task D1: 贵金属 tray (从 metal-ipc 模块级 cache 读 quoteCache)
  try {
    const { getTraySnapshot: getMetalsTraySnapshot } = require("./metal-ipc");
    function pushMetalsToTray() {
      if (!trayMgr) return;
      const snap = getMetalsTraySnapshot();
      trayMgr.setMetals(snap);
    }
    pushMetalsToTray();
    mainLog.info("metals tray initialized (live quoteCache)");

    // 60s 轮询作为 fallback (防止 scheduler 没推过来时 tray 仍能反映最新).
    // 主推送路径仍是 registerMetalIpc({onUpdateTray}) 钩点.
    const METALS_TRAY_REFRESH_MS = 60 * 1000;
    const metalsTrayTimer = setInterval(pushMetalsToTray, METALS_TRAY_REFRESH_MS);
    app.once("before-quit", () => {
      try { clearInterval(metalsTrayTimer); } catch { /* noop */ }
    });
  } catch (err) {
    mainLog.warn(`metals tray init failed: ${err && err.message}`);
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

  // Phase I5: start daily digest scheduler. setInterval(60s) ticks; the job
  // gates on enabled + last_push_date. We use setInterval so the bootstrap
  // completes immediately without waiting for the first tick.
  try {
    startDailySummaryJob({
      getState: () => {
        try { return stateStore.load() || {}; } catch { return {}; }
      },
      setState: (partial) => {
        try {
          if (partial && partial.daily_digest) {
            stateStore.saveDailyDigest(partial.daily_digest);
          }
        } catch (err) {
          mainLog.warn(`[digest] saveDailyDigest failed: ${err && err.message}`);
        }
      },
      getConfig: () => (runtimeConfigRef.current || { apps: [], notifications: {} }),
      sendNotification: (n) => {
        try {
          const { Notification: ElectronNotification } = require("electron");
          if (!ElectronNotification.isSupported || !ElectronNotification.isSupported()) {
            mainLog.warn("[digest] notification not supported on this platform");
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
              if (w && !w.isDestroyed()) w.webContents.send("digest:open", { date: new Date().toISOString().slice(0, 10) });
            } catch (err) {
              mainLog.warn(`[digest] notification click failed: ${err && err.message}`);
            }
          });
          note.show();
        } catch (err) {
          mainLog.warn(`[digest] sendNotification threw: ${err && err.message}`);
        }
      },
    });
    mainLog.info("daily digest job started");
  } catch (err) {
    mainLog.warn(`[digest] job bootstrap failed: ${err && err.message}`);
  }
  timings.ipc = Date.now() - tIpc;

  // 7.4) Metals IPC handlers + scheduler — must register IPC synchronously
  //      BEFORE the renderer can invoke any metals:* channel. Per the
  //      electron-merge-debug skill: any ipcMain.handle that's added after
  //      a renderer invoke would resolve the promise but lose the response.
  //      Scheduler also starts here so initial 5-min tick is on the same
  //      lifecycle as other schedulers (stopped on before-quit below).
  //      v2.22 Task D1 + D1-refactor: register/start are split for clean
  //      lifecycle. onUpdateTray hook goes to startMetalScheduler, NOT to
  //      registerMetalIpc. Tray reads module-level quoteCache (live only)
  //      via getTraySnapshot — no IPC channel for tray updates.
  registerMetalIpc();
  startMetalScheduler({
    onUpdateTray: () => {
      if (!trayMgr) return;
      try {
        const { getTraySnapshot: getMetalsTraySnapshot } = require("./metal-ipc");
        trayMgr.setMetals(getMetalsTraySnapshot());
      } catch (err) { /* noop */ }
    },
  });

  // 7.5) AI usage warmup (fire-and-forget) — 让 renderer 进入 AI 用量页时立即有数据
  //      IPC handlers 已在 registerIpcHandlers 里注册, 这里只跑 warmup
  //      (multi-provider v2: minimax + glm 各自 fire-and-forget)
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

  // 8) fund + reminders + recent listeners + auto-check timer
  fundScheduler = startFundScheduler({
    httpClient,
    fundStore,
    FundScheduler,
    sendToRenderer,
  });
  startRemindersScheduler({ reminders, getWindow, sendToRenderer });
  startWorldcupGoalWatcher({
    getWindow,
    sendToRenderer,
    getConfig: () => runtimeConfigRef.current,
    goalWatcher,
    // v2.22 Task C2.1: 钩 goal-watcher, 每次 sweep 完 (refreshScores 成功) 推一次 tray.
    // 替换之前的 60s setInterval 兜底轮询 — goal-watcher 跟 scores-fetcher 写盘同源,
    // cache 必然 fresh, sweep fire 的时刻就是 tray 反映比分变化的时刻.
    onScoresChanged: pushWorldcupToTray,
  });
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
    // Phase Q5 v1: scan audit fixtures for timer cleanup patterns.
    try {
      const audit = auditTimers(
        path.join(__dirname, "..", "tests", "fixtures", "timer-audit"),
        { logger: mainLog },
      );
      mainLog.info(
        `[timer-registry] startup audit summary: total=${audit.total} clean=${audit.clean} orphan=${audit.orphan} debounce=${audit.debounce} dupSchedule=${audit.dupSchedule}`,
      );
    } catch (err) {
      mainLog.warn(`[timer-registry] startup audit failed: ${err && err.message}`);
    }

    // Phase Q5 v1: clear any remaining managed timers on quit.
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
    }
    try {
      stopMetalScheduler();
    } catch {
      /* noop */
    }
    if (aiUsageScheduler) {
      try { aiUsageScheduler.stop(); } catch { /* noop */ }
    }
    mainLog.info("app quitting");
  });
}

module.exports = {
  loadConfig,
  ARCH,
  CONFIG_PATH,
};
