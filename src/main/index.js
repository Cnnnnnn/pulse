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

// Phase B2b: ai-sessions CursorDetector 读 vscdb 用 Node 22.5+ 内置的 node:sqlite.
// Electron 35 默认不开 experimental flag → require('node:sqlite') 抛 → readSession
// 返 'node:sqlite unavailable' → all sessions 静默 skip → digest 永远 "no sessions".
// 启 flag 让 node:sqlite 可用 (Electron 35 跑 Node 22.15 runtime, flag 稳定).
// 注: 这是 app.commandLine, 必须在 app.whenReady() 之前.
try {
  if (app && app.commandLine && typeof app.commandLine.appendSwitch === 'function') {
    app.commandLine.appendSwitch('experimental-sqlite');
  }
} catch { /* noop — vitest load-smoke 环境里 app 是 undefined */ }

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
const { buildTaskSummaryEngine } = require("../ai-sessions/wiring");

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
 * Step B (LLM classify): 启动期同步对未分类的 app 走 LLM 批量分类.
 *
 * 决策 (用户在 q3 选的 blocking-startup-ok): 同步调, 接受 1-2s 启动延迟.
 *   - 静态 map + state.json.classify_llm_cache 都没有的 app → 收集
 *   - 先 heuristic 预跑一遍, 给 LLM 提示 "我猜是 X"
 *   - 调 LLM 一次, batch 出所有结果
 *   - 写 state.json.classify_llm_cache + category.setLLMCache
 *   - 整体 timeout 30s, 失败 graceful (不 throw, 也不阻塞启动流程, 但 log warn)
 *
 * 设计:
 *   - 强制用 qwen2.5-coder:7b (用户在 q2 选的, 跟 aiSessions.provider 解耦)
 *   - 不复用 LLMSummarizer 抽象 (那是给 messages 用的, 分类是 (system, user) plain)
 *   - 复用 HttpClient (跟其他 detector 风格一致)
 *
 * 行为:
 *   - 0 unmapped app → 跳过, 0 延迟
 *   - 1-2 unmapped app → 1 次 LLM 调, 2-3s
 *   - 3+ unmapped app → 1 次 LLM 调 (batch), 3-5s
 *   - LLM 不可达 / 解析失败 → graceful skip, log warn, 用户看到 "其他" tab
 */
async function classifyUnmappedAppsByLLM() {
  const t0 = Date.now();
  if (!runtimeConfig || !Array.isArray(runtimeConfig.apps) || runtimeConfig.apps.length === 0) {
    return;
  }
  // 1) reload state.json 旧 cache → 注入 category module (避免重复 LLM)
  const oldCache = stateStore.loadLLMClassifyCache();
  if (Object.keys(oldCache).length > 0) {
    categoryConfig.setLLMCache(oldCache);
    mainLog.info(`[category] LLM cache loaded: ${Object.keys(oldCache).length} entries`);
  }

  // 2) 收集未分类的 app (静态 map miss + cache miss)
  const unmapped = [];
  for (const app of runtimeConfig.apps) {
    if (!app || typeof app.name !== "string" || app.name.length === 0) continue;
    if (categoryConfig.getCategory(app.name) !== "other") continue;
    // heuristic 预跑, 给 LLM 提示
    const heur = categoryConfig.classifyByHeuristic(app);
    unmapped.push({
      name: app.name,
      bundle: app.bundle,
      download_url: app.download_url,
      _heuristic: heur || undefined,
    });
  }
  if (unmapped.length === 0) {
    mainLog.info("[category] all apps already classified, skip LLM");
    return;
  }
  mainLog.info(`[category] ${unmapped.length} unmapped apps → LLM classify`);

  // 3) 调 LLM (走 HttpClient, 跟 detector 同款)
  const host = "http://127.0.0.1:11434";  // 强制 IPv4 — node:fetch 走 ::1 ECONNREFUSED
  const model = "qwen2.5-coder:7b";
  const http = new HttpClient({ timeout: 30_000, maxRetries: 0 });
  const llmCaller = async (systemMsg, userMsg) => {
    const r = await http.post(
      `${host}/api/chat`,
      {
        model,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg },
        ],
        stream: false,
        options: { num_predict: 1024, temperature: 0.1 },
      },
      { "Content-Type": "application/json" },
      { timeout: 25_000 },
    );
    if (r.error) throw new Error(`llm caller: ${r.error} (${r.status || "no_status"})`);
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`llm caller: http_status_${r.status} body=${(r.body || "").slice(0, 200)}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(r.body);
    } catch (err) {
      throw new Error(`llm caller: response not JSON: ${err.message}`);
    }
    const content = parsed && parsed.message && typeof parsed.message.content === "string"
      ? parsed.message.content
      : "";
    return content;
  };

  let llmResult = {};
  try {
    llmResult = await categoryConfig.classifyByLLM(unmapped, {
      llmCaller,
      timeoutMs: 28_000,
    });
  } catch (err) {
    mainLog.warn(`[category] LLM classify threw: ${err.message}`);
  }

  // 4) 落盘 + 注入 module
  if (Object.keys(llmResult).length > 0) {
    categoryConfig.setLLMCache(llmResult);
    stateStore.saveLLMClassifyCache(llmResult);
    mainLog.info(
      `[category] LLM classified ${Object.keys(llmResult).length}/${unmapped.length} apps in ${Date.now() - t0}ms: ${Object.entries(llmResult).map(([k, v]) => `${k}→${v}`).join(", ")}`,
    );
  } else {
    mainLog.warn(
      `[category] LLM classify returned 0 results in ${Date.now() - t0}ms (apps will fall through to 'other')`,
    );
  }
}

/**
 * 重做版: 初始化 TaskSummaryEngine wiring (不跑任何 LLM / 不扫盘).
 * 完全按需 — 用户打开抽屉时 IPC 'ai-tasks:list' 才扫描, 勾选生成才调 LLM.
 * 没有 bootstrap / backfill / 24h cron.
 */
function initAiTasksWiring() {
  const stateOverride = stateStore.loadAISessionsConfig();
  const cfgBase = stateOverride && typeof stateOverride === 'object'
    ? stateOverride
    : { enabled: false, provider: 'minimax', cloud: null };

  try {
    const wiring = buildTaskSummaryEngine({
      config: cfgBase,
      runtimeOverride: stateStore.loadAISessionsConfig(),
      log: {
        info: (...a) => mainLog.info(...a),
        warn: (...a) => mainLog.warn(...a),
        error: (...a) => mainLog.error(...a),
      },
    });
    global.__pulse_aiTasks = wiring; // 暴露给 IPC handlers
    global.__pulse_aiSessionsBaseCfg = cfgBase; // 给 ipc save-config 重建用
    const detectorNames = wiring.detectors.map((d) => d.appName).join(",");
    mainLog.info(
      `[tasks] wiring ready: provider=${wiring.providerId} detectors=[${detectorNames}]`,
    );
  } catch (err) {
    mainLog.warn(`[tasks] buildTaskSummaryEngine failed: ${err.message}`);
  }
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

  // 0.5) Step B (LLM classify): 启动期同步对未分类的 app 调 LLM.
  // 在 worker pool 之前: 分类结果存到 category module, IPC handler 直接读.
  // 失败 graceful — 不阻塞启动 (最坏情况: 1-2s 启动延迟 + "其他" tab 多几个 app).
  await classifyUnmappedAppsByLLM();

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

  // 2.5) AI 任务总结 wiring (重做版: 只初始化, 不扫盘不调 LLM)
  initAiTasksWiring();

 //3) dock隐藏 (默认). PULSE_SHOW=1 env var时不 hide — 给 dev / screenshot / debugging用
try {
  // Phase B7e: 默认让 Pulse 出现在 Dock + Cmd+Tab 列表, 像普通 app.
  // 之前默认 dock.hide() 是 menu bar app 风格, 用户反馈想用 Cmd+Tab 切换.
  // PULSE_HIDE_DOCK=1 保留 escape hatch (测试 / 老用户).
  if (process.env.PULSE_HIDE_DOCK === '1') {
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
    getConfigPath: () => CONFIG_PATH,
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
    // v2.7.0: library IPC 写完 config.json 后, 重新 reload 到内存并通知 renderer.
    onConfigUpdated: (newConfig) => {
      runtimeConfig = newConfig;
      mainLog.info(`config updated: ${newConfig.apps.length} apps, library.pinned=${(newConfig.library && newConfig.library.pinned.length) || 0}`);
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
    // macOS: 点击 dock 图标 (无 window / window 全关) 触发.
    // 双击 dock 图标 raise 窗口也走这里 (window 还活着但 hidden).
    // 双重保险: winMgr 还没初始化时 (极早期 activate) 直接调 showWindow.
    if (winMgr) {
      winMgr.showWindow();
    } else {
      // 早期: 等 createWindowManager 起来再 show, 或直接 fallback BrowserWindow.getAllWindows
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) {
        const w = wins[0];
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
        if (process.platform === 'darwin') {
          try { w.moveTop(); } catch { /* noop */ }
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

// 导出供测试用
module.exports = {
  loadConfig,
  ARCH,
  CONFIG_PATH,
};
