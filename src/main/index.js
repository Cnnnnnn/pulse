/**
 * src/main/index.js
 *
 * 主进程入口（spec §6 + 任务约束）：
 *   - 单实例锁
 *   - lifecycle: whenReady / before-quit / window-all-closed
 *   - 启动 worker pool（detect-app / brew-upgrade / brew-update）
 *   - 注册 tray / window / ipc
 *   - 启动时自动迁移老 config → 备份 .bak
 *   - 启动时加载 category config (Phase A) → setData 注入
 *   - 埋点：写 startup.log + detect.log
 *
 * 被 electron 直接 require；用 CJS。
 */

const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const { WorkerPool } = require("../workers/pool");
const { createWindowManager } = require("./window");
const { createTrayManager } = require("./tray");
const { registerIpcHandlers } = require("./ipc");
const { runCheck } = require("./check-runner");
const { mainLog, detectLog } = require("./log");
const { migrateConfigFile, isOldSchemaApp } = require("../config/migrate");
const { validateConfig, sanitizeConfig } = require("../config/schema");
const categoryConfig = require("../config/category");
const stateStore = require("./state-store");
const lastOpened = require("./last-opened");
const { HttpClient } = require("./http-client");
const { OllamaSummarizer } = require("../ai-sessions/provider-ollama");
const { buildDailyDigestRunner } = require("../ai-sessions/wiring");

const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
const CATEGORIES_JSON_PATH = path.join(
  PROJECT_ROOT,
  "config",
  "categories.json",
);
const APP_CATEGORY_JSON_PATH = path.join(
  PROJECT_ROOT,
  "config",
  "app-category.json",
);

let isQuitting = false;
let pool = null;
let trayMgr = null;
let winMgr = null;
let runtimeConfig = null;

// ─── config: load + migrate ─────────────────────────────

function loadConfig() {
  let parsed = null;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    parsed = JSON.parse(raw);
  } catch (err) {
    mainLog.error(`config read/parse failed: ${err.message}`);
    return sanitizeConfig(null);
  }

  // 老 schema 触发自动迁移
  const oldShape =
    Array.isArray(parsed && parsed.apps) && parsed.apps.some(isOldSchemaApp);
  if (oldShape) {
    try {
      const r = migrateConfigFile({ configPath: CONFIG_PATH });
      if (r.migrated) {
        mainLog.info(`config migrated; backup=${r.backupPath}`);
        parsed = r.config;
      }
    } catch (err) {
      mainLog.error(`config migrate failed: ${err.message}`);
      // 继续用 sanitize 后的 fallback
    }
  }

  const v = validateConfig(parsed);
  if (!v.valid) {
    mainLog.warn(`config validation: ${v.errors.slice(0, 5).join(" | ")}`);
  }
  return sanitizeConfig(v.config || parsed);
}

// ─── bootstrap ───────────────────────────────────────────

/**
 * Phase A: 启动时加载 category config. fs 读 config/*.json, 注入到 category module.
 * 失败时 log warn, 不 throw (跟现有 config 容错一致).
 */
function loadCategoryConfig() {
  let cats = null;
  let map = null;
  let usedFallback = false;

  try {
    const raw = fs.readFileSync(CATEGORIES_JSON_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.categories) &&
      parsed.categories.length > 0
    ) {
      cats = parsed.categories;
    }
  } catch (err) {
    mainLog.warn(`[category] categories.json read failed: ${err.message}`);
  }

  try {
    const raw = fs.readFileSync(APP_CATEGORY_JSON_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.mapping && typeof parsed.mapping === "object") {
      map = parsed.mapping;
    }
  } catch (err) {
    mainLog.warn(`[category] app-category.json read failed: ${err.message}`);
  }

  if (cats === null || map === null) {
    usedFallback = true;
    categoryConfig.setData({ source: "fallback" }); // 用 module-level DEFAULT
    mainLog.warn("[category] using hardcoded defaults (failed to read disk)");
    return;
  }

  categoryConfig.setData({ cats, map, source: "disk" });
  const status = categoryConfig._LOAD_STATUS();
  if (status.warnings.length > 0) {
    mainLog.warn(`[category] load warnings: ${status.warnings.join("; ")}`);
  }
  mainLog.info(
    `[category] loaded ${cats.length} categories, ${Object.keys(map).length} mappings`,
  );
}

/**
 * Phase B3b: 启动时 healthcheck ollama (默认 provider). 3s timeout, 失败 log warn,
 * 不阻塞启动 (spec §6 启动解耦). daily digest 跑时再失败再说.
 */
async function runAISessionsHealthcheck() {
  const cfg = runtimeConfig && runtimeConfig.aiSessions;
  if (!cfg || !cfg.enabled) {
    mainLog.info("[ai-sessions] disabled in config, skip healthcheck");
    return;
  }
  const provider = cfg.provider || "ollama";
  if (provider !== "ollama") {
    // cloud provider 的 healthcheck 走 cloud impl (B6 才接). 现在只 ollama.
    mainLog.info(
      `[ai-sessions] provider=${provider}, healthcheck deferred to B6`,
    );
    return;
  }
  const model = (cfg.ollama && cfg.ollama.model) || "qwen3.5:9b";
  const host = (cfg.ollama && cfg.ollama.host) || "http://localhost:11434";
  const http = new HttpClient({ timeout: 3_000, maxRetries: 0 });
  const ollama = new OllamaSummarizer();
  try {
    const r = await ollama.healthcheck({
      provider,
      model,
      config: { host },
      httpClient: http,
    });
    if (r.ok) {
      mainLog.info(
        `[ai-sessions] ollama healthcheck ok (${r.latencyMs}ms, ${host})`,
      );
    } else {
      mainLog.warn(
        `[ai-sessions] ollama healthcheck failed: ${r.error} (${r.latencyMs}ms, ${host})`,
      );
    }
  } catch (err) {
    mainLog.warn(`[ai-sessions] ollama healthcheck threw: ${err.message}`);
  }
}

/**
 * Phase B4: 实例化 DailyDigestRunner,跑昨天 (idempotent) + 可选7 天 backfill,
 *启24h cron.失败不阻塞启动 (跟 B3 healthcheck 同款).
 *
 * Phase B6b.5: runtime override —读 state.json ai_sessions_config (Settings modal改的),
 *优先于 config.json. wiring.mergeAISessionsConfig合并.
 */
async function runDailyDigestBootstrap() {
  // config.json 可能没有 aiSessions 块（你目前就是这种情况）。
  // 这时必须仍然初始化 wiring，让后续 Settings 里的“测试连接/回填”能工作。
  const cfgBase =
    runtimeConfig && runtimeConfig.aiSessions
      ? runtimeConfig.aiSessions
      : { enabled: false, provider: "ollama", ollama: {}, cloud: null };

  let wiring;
  try {
    wiring = buildDailyDigestRunner({
      config: cfgBase,
      runtimeOverride: stateStore.loadAISessionsConfig(),
      log: {
        info: (...a) => mainLog.info(...a),
        warn: (...a) => mainLog.warn(...a),
        error: (...a) => mainLog.error(...a),
      },
    });
    global.__pulse_dailyDigest = wiring; // 暴露给 IPC handlers (B4c)
    global.__pulse_aiSessionsBaseCfg = cfgBase; // 给 ipc save-config 重建用
  } catch (err) {
    mainLog.warn(`[digest] buildDailyDigestRunner failed: ${err.message}`);
    return;
  }

  // 仅当 merged config.enabled=true 时才跑 bootstrap + 24h cron
  const enabled = Boolean(
    wiring &&
    wiring.runner &&
    wiring.runner.config &&
    wiring.runner.config.enabled,
  );
  if (!enabled) {
    mainLog.info(
      "[digest] ai-sessions disabled in merged config, skip bootstrap/cron",
    );
    return;
  }

  try {
    const result = await wiring.runner.bootstrap();
    mainLog.info(
      `[digest] bootstrap done: yesterday=${result.yesterday ? "ok" : "skipped"} backfill=${result.backfill ? "done" : "skipped"}`,
    );
  } catch (err) {
    mainLog.warn(`[digest] bootstrap failed: ${err.message}`);
  }
  // 24h cron (idempotent, 多次调不会重复启)
  wiring.start(86400_000);
  mainLog.info("[digest] 24h cron started");
}

async function bootstrap() {
  const t0 = Date.now();
  // 整进程级别的启动元信息 — 写一行, 便于人 grep
  mainLog.info(
    `boot pid=${process.id} arch=${ARCH} platform=${process.platform}`,
  );

  // 各阶段计时点 — spec §6 启动埋点格式
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

  // 1) 单实例锁
  // 冷启动基准模式 (BENCH=1): 跳过单实例锁, 允许同时跑多个 .app 实例
  // 真实用户场景下不需要多实例, 但 benchmark 需要
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

  // 2) config
  const tConfig = Date.now();
  runtimeConfig = loadConfig();
  mainLog.info(
    `config loaded: ${(runtimeConfig.apps || []).length} apps, check_on_launch=${runtimeConfig.check_on_launch}`,
  );
  timings.config = Date.now() - tConfig;

  // 2.5) Phase B3b + B4: AI sessions healthcheck + DailyDigestRunner bootstrap
  // 必须在 loadConfig() 之后，因为需要 runtimeConfig.aiSessions
  await runAISessionsHealthcheck();
  await runDailyDigestBootstrap();

  // 3) dock 隐藏
  try {
    app.dock.hide();
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
    size: Math.max(2, (require("os").cpus().length || 4) - 1),
    workerScript,
    workerOpts: { workerData: { arch: ARCH } },
    onProgress: (payload, id) => {
      const w = winMgr && winMgr.getWindow();
      if (w && !w.isDestroyed()) {
        w.webContents.send("check-progress", payload);
      }
    },
    onLog: (level, text, id, meta) => {
      // worker 自己 postMessage 的 log 消息: 走 main 的 detect logger 落盘
      // worker 现在发 spec §6 风格的 meta (k=v 拍平), 直接透传
      //   老式 free-text log (text 存在) 也兼容 — 把 workerId 塞到 meta.wid
      const m =
        meta && typeof meta === "object" ? { wid: id, ...meta } : { wid: id };
      if (text) {
        // 自由文本: 把 text 放在 meta.note, 避免占位
        m.note = text;
      }
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
  // window ready-to-show 由 BrowserWindow 自己 fire; 这里量"创建耗时"
  mainLog.info(`window created: ${Date.now() - tWindow}ms`);
  timings.window = Date.now() - tWindow;

  // 6) tray
  const tTrayStart = Date.now();
  try {
    trayMgr = createTrayManager({
      getConfig: () => runtimeConfig || { apps: [] },
      getConfigPath: () => CONFIG_PATH,
      onCheck: () => {
        const w = winMgr && winMgr.getWindow();
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
  // Phase 29: 每次 check 完成后, 后台 refresh last-opened (mdls + atime 全刷),
  // 写 state.json + 推 last-opened-updated 事件给 renderer.
  // 11 app × ~100ms 总 ~1.2s, fire-and-forget, 不阻塞主流程.
  //
  // Phase 29 hotfix: a.bundle is just the bundle name ("Cursor.app"), not a
  // full path. mdls/stat need absolute path. Prepend /Applications/.
  // (User-installed apps go to /Applications; for custom dirs, would need
  // a config knob — v2.4 territory.)
  function resolveBundlePath(bundleName) {
    if (!bundleName) return null;
    if (bundleName.startsWith("/")) return bundleName; // 已是绝对路径
    return `/Applications/${bundleName}`;
  }
  function refreshLastOpenedAfterCheck() {
    const apps = (runtimeConfig && runtimeConfig.apps) || [];
    const refreshable = apps.filter((a) => a && a.name && a.bundle);
    if (refreshable.length === 0) return;
    (async () => {
      try {
        const next = {};
        await Promise.all(
          refreshable.map(async (a) => {
            const path = resolveBundlePath(a.bundle);
            if (!path) {
              next[a.name] = { ms: null, source: "unknown" };
              return;
            }
            try {
              const r = await lastOpened.refreshOne(path);
              next[a.name] = { ms: r.ms, source: r.source };
            } catch (err) {
              mainLog.warn(
                `[last-opened] refresh item failed: ${a.name} ${err && err.message}`,
              );
              next[a.name] = { ms: null, source: "unknown" };
            }
          }),
        );
        stateStore.saveLastOpened(next);
        const w = winMgr && winMgr.getWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send("last-opened-updated", { lastOpened: next });
        }
      } catch (err) {
        mainLog.warn(
          `[last-opened] batch refresh failed: ${err && err.message}`,
        );
      }
    })();
  }

  registerIpcHandlers({
    getConfig: () => runtimeConfig,
    pool,
    getWindow: () => winMgr && winMgr.getWindow(),
    // Phase 12: 每次 check-updates 完成时落盘 last-known 状态
    getCachedState: () => stateStore.load(),
    onCheckComplete: (results) => {
      if (trayMgr) {
        trayMgr.setResults(results);
        const count = results.filter((r) => r.has_update).length;
        trayMgr.setBadge(count);
      }
      // 持久化最新结果 (atomic write, 失败也不影响内存流)
      try {
        stateStore.saveAll(results);
      } catch (err) {
        mainLog.warn(`state save failed: ${err.message}`);
      }
      // Phase 29: 刷 last-opened (后台 async, 不阻塞)
      refreshLastOpenedAfterCheck();
    },
  });
  mainLog.info(`ipc registered`);
  timings.ipc = Date.now() - tIpc;

  // Phase 16: 后台定时静默 check — 打破"开 app 才检查"局限, 让 state 不变 stale
  //   - 默认每 6h 跑一次, Phase 24 起可由 config.notifications.check_interval_hours 配置
  //   - 0 = 关闭 auto-check (显式 disable)
  //   - silent=true 模式: 不发系统通知, 不弹 "checking" UI, 只更新 state + tray badge
  //   - 推 'auto-check-finished' 事件给 renderer, 让 UI 显示"刚刚自动检查过"
  //   - 应用退出时 clearInterval
  const checkIntervalHours =
    (runtimeConfig &&
      runtimeConfig.notifications &&
      runtimeConfig.notifications.check_interval_hours) ||
    6;
  if (checkIntervalHours > 0) {
    const AUTO_CHECK_INTERVAL_MS = checkIntervalHours * 60 * 60 * 1000;
    const autoCheckTimer = setInterval(() => {
      mainLog.info(`auto-check triggered (${checkIntervalHours}h)`);
      runCheck(
        {
          getConfig: () => runtimeConfig,
          pool,
          getWindow: () => winMgr && winMgr.getWindow(),
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
          },
          // Phase 17: auto-check 也用 state 跟踪 last_notified (虽然 silent 不发通知,
          // 但写状态保持一致). 这里不传 getState / markNotified, 因为 auto-check 静默.
        },
        { silent: true },
      ).catch((err) => {
        mainLog.warn(`auto-check failed: ${err && err.message}`);
      });
    }, AUTO_CHECK_INTERVAL_MS);
    mainLog.info(`auto-check timer set: every ${checkIntervalHours}h`);

    // 退出时清掉
    if (!isQuitting) {
      app.once("before-quit", () => {
        try {
          clearInterval(autoCheckTimer);
        } catch {
          /* noop */
        }
      });
    }
  } else {
    mainLog.info(
      "auto-check disabled (notifications.check_interval_hours = 0)",
    );
  }

  // ── spec §6 启动埋点: 一行 [startup] 把所有阶段耗时汇在一起 ──
  timings.total = Date.now() - t0;
  // 兼容老字段名: tray= (tray install), window= (window create)
  // spec 字段名优先: tray / window / total
  mainLog.event({
    tray: `${timings.tray}ms`,
    window: `${timings.window}ms`,
    total: `${timings.total}ms`,
    apps: (runtimeConfig.apps || []).length,
  });
}

// ─── app lifecycle ───────────────────────────────────────

// 守卫：当 require('electron') 在非 electron runtime（Node 测试）下
// app 是 undefined；只有真 electron 跑 main 时才会执行下面。
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
    if (winMgr) winMgr.showWindow();
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

// 导出供测试用
module.exports = {
  loadConfig,
  ARCH,
  CONFIG_PATH,
};
