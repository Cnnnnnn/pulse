/**
 * src/main/ipc.js
 *
 * IPC handler 注册（spec §6 协议）。
 *   renderer → main:  check-updates, brew-upgrade, bulk-upgrade:start/cancel,
 *                     get-config, get-cached-state, get-app-icon, open-url
 *   main → renderer:  check-progress (worker 进度)
 *                    check-started, check-finished (手动)
 *                    auto-check-finished (Phase 16 后台静默检查)
 *                    start-check (tray 点 "检查更新" 触发)
 *                    bulk-upgrade:progress, bulk-upgrade:done (Bulk Upgrade)
 *
 * 约束：主进程不直接跑检测，全部走 worker pool。
 *       Bulk Upgrade 在主进程跑（顺序 shell exec，不阻塞事件循环）。
 */

const { ipcMain, shell } = require("electron");
const { runCheck } = require("./check-runner");
const { runBulkUpgrade } = require("./bulk-upgrade");
const stateStore = require("./state-store");
const { getAppIcon } = require("./app-icon");
const { mainLog } = require("./log");
const lastOpened = require("./last-opened");
const aiStorage = require("../ai-sessions/storage");
const { CloudSummarizer } = require("../ai-sessions/provider-cloud");
const { PROVIDER_ENDPOINTS } = require("../ai-sessions/provider-cloud");
const { HttpClient } = require("./http-client");
const configStore = require("./config-store");
const libraryScanner = require("./library/scanner");
const libraryOps = require("./library/ops");
const libraryDetect = require("./library/detect");

// Bulk Upgrade: 一次只能跑一批; 用 AbortController 控制取消.
let bulkUpgradeCtrl = null;
let bulkUpgradeRunning = false;

/**
 * @param {object} deps
 * @param {object} deps.getConfig         () => config object
 * @param {object} deps.pool              WorkerPool 实例
 * @param {object} deps.getWindow         () => BrowserWindow | null
 * @param {object} deps.onCheckComplete   (results) => void   (用于更新 tray/badge)
 * @param {object} [deps.getCachedState]  () => state object  (Phase 12 last-known 缓存)
 * @param {object} [deps.onConfigUpdated] (newConfig) => void   (v2.7.0 library: 写完通知 caller reload)
 * @param {object} [deps.getConfigPath]   () => string           (v2.7.0 library: 给 config-store 用)
 */
function registerIpcHandlers(deps) {
  const { getConfig, pool, getWindow, onCheckComplete, getCachedState, onConfigUpdated, getConfigPath } = deps;

  function sendToRenderer(channel, payload) {
    const w = getWindow && getWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload);
    }
  }

  // ── renderer → main ─────────────────────────────────────────

  ipcMain.handle("get-config", () => {
    try {
      return getConfig();
    } catch {
      return { check_on_launch: true, apps: [] };
    }
  });

  // Phase 12: renderer 启动时拉取 last-known state, 避免网络抽风时 UI 一片空白
  ipcMain.handle("get-cached-state", () => {
    if (typeof getCachedState !== "function") return null;
    try {
      return getCachedState();
    } catch {
      return null;
    }
  });

  ipcMain.handle("check-updates", async () => {
    // Phase 16/17: 抽到 check-runner.runCheck, 注入 state-store 让 quiet hours / cooldown
    // 跟踪 last_notified 字段
    return runCheck(
      {
        getConfig,
        pool,
        getWindow,
        onCheckComplete,
        getState: () => {
          try {
            return stateStore.load();
          } catch {
            return null;
          }
        },
        markNotified: (names) => {
          try {
            stateStore.markNotified(names);
          } catch {
            /* noop */
          }
        },
      },
      { silent: false },
    );
  });

  ipcMain.handle("brew-upgrade", async (_event, caskName) => {
    if (!caskName) return { success: false, output: "no cask" };
    // 走 worker 跑（保持主进程不阻塞）
    return pool.enqueue({ type: "brew-upgrade", payload: { cask: caskName } });
  });

  ipcMain.handle("open-url", async (_event, url) => {
    if (url && /^https?:\/\//.test(url)) {
      try {
        await shell.openExternal(url);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  });

  // ── Bulk Upgrade ────────────────────────────────────────
  // 一次只跑一批; 跑的时候再发 start 会直接拒绝, 避免并发 brew 撞 mutex.

  ipcMain.handle("bulk-upgrade:start", async (_event, items) => {
    if (bulkUpgradeRunning) {
      return { ok: false, reason: "already running" };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, reason: "no items" };
    }
    bulkUpgradeRunning = true;
    bulkUpgradeCtrl = new AbortController();
    const ctrl = bulkUpgradeCtrl;

    // fire-and-forget: 返回 ok=true 表示"开始", 进度/完成走事件
    runBulkUpgrade({
      items,
      signal: ctrl.signal,
      onProgress: (evt) => {
        sendToRenderer("bulk-upgrade:progress", evt);
      },
    })
      .then((summary) => {
        sendToRenderer("bulk-upgrade:done", summary);
        if (ctrl === bulkUpgradeCtrl) {
          bulkUpgradeCtrl = null;
          bulkUpgradeRunning = false;
        }
      })
      .catch((err) => {
        // runBulkUpgrade 内部已经 per-item catch, 跑到这说明 outside 出错
        sendToRenderer("bulk-upgrade:done", {
          succeeded: [],
          failed: [{ id: "?", error: (err && err.message) || "unknown" }],
          skipped: [],
          cancelled: false,
        });
        if (ctrl === bulkUpgradeCtrl) {
          bulkUpgradeCtrl = null;
          bulkUpgradeRunning = false;
        }
      });

    return { ok: true, count: items.length };
  });

  ipcMain.handle("bulk-upgrade:cancel", async () => {
    if (!bulkUpgradeRunning || !bulkUpgradeCtrl) {
      return { ok: false, reason: "not running" };
    }
    bulkUpgradeCtrl.abort();
    return { ok: true };
  });

  // ── 兼容旧 channel 已删除 (Phase 13): get-installed-version / brew-update ──

  // Phase 25: 读 app bundle 真实图标 (macOS), 返 base64 dataUrl.
  //   - bundle 路径: 通常 '/Applications/Cursor.app' 这种 .app bundle
  //   - 失败: 返 { error: 'not_found' }, 不抛
  //   - 成功: 返 { dataUrl: 'data:image/png;base64,...' } (64x64)
  ipcMain.handle("get-app-icon", async (_event, bundlePath) => {
    try {
      const dataUrl = await getAppIcon(bundlePath);
      if (!dataUrl) return { error: "not_found" };
      if (typeof dataUrl !== "string" || dataUrl.length < 30)
        return { error: "invalid" };
      return { dataUrl };
    } catch (err) {
      mainLog.warn("[ipc] get-app-icon threw", {
        bundle: bundlePath,
        msg: err && err.message,
      });
      return { error: "threw" };
    }
  });

  // ── Phase 27: Mutes (per-app 静音) ─────────────────────
  // 渲染进程负责显示菜单 / 触发 setMute / clearMute; 主进程只管读写 state.json
  // (跟 last_notified 同一条线). 同步返当前 mutes, 让 renderer 立即更新 signal.

  ipcMain.handle("get-mutes", () => {
    try {
      return { mutes: stateStore.getMutes() };
    } catch (err) {
      mainLog.warn("[ipc] get-mutes threw", { msg: err && err.message });
      return { mutes: {} };
    }
  });

  /**
   * @param {string} name        app name
   * @param {number} durationSec 静音时长 (秒). 0 = 永远.
   */
  ipcMain.handle("set-mute", (_event, name, durationSec) => {
    if (!name || typeof name !== "string") {
      return {
        ok: false,
        reason: "invalid_name",
        mutes: stateStore.getMutes(),
      };
    }
    if (
      typeof durationSec !== "number" ||
      !Number.isFinite(durationSec) ||
      durationSec < 0
    ) {
      return {
        ok: false,
        reason: "invalid_duration",
        mutes: stateStore.getMutes(),
      };
    }
    try {
      const untilMs = durationSec === 0 ? 0 : Date.now() + durationSec * 1000;
      const next = stateStore.setMute(name, untilMs, "manual");
      return { ok: true, mutes: next.mutes };
    } catch (err) {
      mainLog.warn("[ipc] set-mute threw", { name, msg: err && err.message });
      return { ok: false, reason: "threw", mutes: stateStore.getMutes() };
    }
  });

  ipcMain.handle("clear-mute", (_event, name) => {
    if (!name || typeof name !== "string") {
      return {
        ok: false,
        reason: "invalid_name",
        mutes: stateStore.getMutes(),
      };
    }
    try {
      const next = stateStore.clearMute(name);
      return { ok: true, mutes: next.mutes };
    } catch (err) {
      mainLog.warn("[ipc] clear-mute threw", { name, msg: err && err.message });
      return { ok: false, reason: "threw", mutes: stateStore.getMutes() };
    }
  });

  // ── Phase 29: Last-opened (per-app 最近打开时间) ────────────
  // 渲染进程 bootstrap 拉一次, 用于 AppInfo 显示"上次打开 N 天前".
  // 后续 checkUpdates 完成后, 主进程后台 refresh + 推 last-opened-updated 事件.

  ipcMain.handle("get-last-opened", () => {
    try {
      return { lastOpened: stateStore.loadLastOpened() };
    } catch (err) {
      mainLog.warn("[ipc] get-last-opened threw", { msg: err && err.message });
      return { lastOpened: {} };
    }
  });

  /**
   * 强制全量刷 last-opened. fire-and-forget — 完成时推 last-opened-updated 事件.
   * - 不阻塞 IPC (Promise 在后台跑)
   * - 11 app × ~100ms 一次 mdls, 总耗时 ~1.2s, 不阻塞 UI
   * - 写入 state.json
   *
   * config 中 a.bundle 是裸 bundle 名 (e.g. "Cursor.app"), mdls/stat 需要
   * 绝对路径 (/Applications/Cursor.app). 这里做一次 resolve.
   */
  ipcMain.handle("refresh-last-opened", () => {
    const apps = (getConfig() && getConfig().apps) || [];
    const refreshable = apps.filter((a) => a && a.name && a.bundle);
    if (refreshable.length === 0) {
      return { ok: true, count: 0 };
    }
    // fire-and-forget
    (async () => {
      try {
        const next = {};
        await Promise.all(
          refreshable.map(async (a) => {
            const path = a.bundle.startsWith("/")
              ? a.bundle
              : `/Applications/${a.bundle}`;
            try {
              const r = await lastOpened.refreshOne(path);
              next[a.name] = { ms: r.ms, source: r.source };
            } catch (err) {
              mainLog.warn("[ipc] refresh-last-opened item failed", {
                name: a.name,
                msg: err && err.message,
              });
              next[a.name] = { ms: null, source: "unknown" };
            }
          }),
        );
        stateStore.saveLastOpened(next);
        sendToRenderer("last-opened-updated", { lastOpened: next });
      } catch (err) {
        mainLog.warn("[ipc] refresh-last-opened batch failed", {
          msg: err && err.message,
        });
      }
    })();
    return { ok: true, count: refreshable.length };
  });

  // ── Phase A (App Categorization): active category tab ─────────
  // 渲染进程 bootstrap 拉一次, 用于还原上次选中的 tab.
  // 切 tab 时通过 save-active-category 写回.

  ipcMain.handle("get-active-category", () => {
    try {
      return { activeCategory: stateStore.loadActiveCategory() };
    } catch (err) {
      mainLog.warn("[ipc] get-active-category threw", {
        msg: err && err.message,
      });
      return { activeCategory: "all" };
    }
  });

  ipcMain.handle("save-active-category", (_event, id) => {
    if (typeof id !== "string" || id.length === 0) {
      return {
        ok: false,
        reason: "invalid_id",
        activeCategory: stateStore.loadActiveCategory(),
      };
    }
    try {
      const next = stateStore.saveActiveCategory(id);
      return { ok: true, activeCategory: next.active_category };
    } catch (err) {
      mainLog.warn("[ipc] save-active-category threw", {
        id,
        msg: err && err.message,
      });
      return {
        ok: false,
        reason: "threw",
        activeCategory: stateStore.loadActiveCategory(),
      };
    }
  });

  // ── AI 任务总结 (重做版): 按需扫描 + 按需生成 ─────
  // 没有 bootstrap / backfill / cron. 用户打开抽屉 → ai-tasks:list 扫盘 (不调 LLM),
  // 勾选生成 → ai-tasks:summarize 逐任务调 LLM, 每完成一个推 ai-task-summary-updated.

  function _getAiTasksWiring() {
    return global.__pulse_aiTasks || null;
  }

  function _localDateKey(offsetDays = 0) {
    const t = Date.now() - (offsetDays | 0) * 86400_000;
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(t));
  }

  // 扫描某天的任务列表 (不调 LLM). opts: { dateKey?: 'YYYY-MM-DD' }, 默认今天.
  ipcMain.handle("ai-tasks:list", async (_event, opts) => {
    const wiring = _getAiTasksWiring();
    if (!wiring) return { ok: false, reason: "not_initialized" };
    const dateKey =
      opts && typeof opts.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateKey)
        ? opts.dateKey
        : _localDateKey(0);
    try {
      const r = await wiring.engine.listTasks(dateKey, { now: Date.now() });
      return { ok: true, ...r };
    } catch (err) {
      mainLog.warn("[ipc] ai-tasks:list failed", { dateKey, msg: err.message });
      return { ok: false, reason: "threw", error: err.message };
    }
  });

  // 为选中任务生成总结. opts: { dateKey, taskKeys: string[] }.
  // 每个任务完成/失败即推 ai-task-summary-updated 事件 (单任务粒度).
  ipcMain.handle("ai-tasks:summarize", async (_event, opts) => {
    const wiring = _getAiTasksWiring();
    if (!wiring) return { ok: false, reason: "not_initialized" };
    const dateKey =
      opts && typeof opts.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateKey)
        ? opts.dateKey
        : _localDateKey(0);
    const taskKeys =
      opts && Array.isArray(opts.taskKeys)
        ? opts.taskKeys.filter((k) => typeof k === "string" && k.length > 0)
        : [];
    if (taskKeys.length === 0) {
      return { ok: false, reason: "no_tasks_selected" };
    }
    try {
      const r = await wiring.engine.summarizeTasks(taskKeys, {
        dateKey,
        now: Date.now(),
        onTaskDone: (event) => {
          sendToRenderer("ai-task-summary-updated", { dateKey, ...event });
        },
      });
      return { ok: r.ok, dateKey, results: r.results, failures: r.failures };
    } catch (err) {
      mainLog.warn("[ipc] ai-tasks:summarize failed", { dateKey, msg: err.message });
      return { ok: false, reason: "threw", error: err.message };
    }
  });

  // 跳转原始 session (任务卡 "查看原始" 按钮触发).
  // target 形如 "cursor://file/...", "codex://...", "minimax://...", 或绝对文件路径.
  // URL scheme 走 shell.openExternal, 绝对路径走 shell.openPath (默认 app 打开).
  const { shell } = require('electron');
  ipcMain.handle("ai-sessions:open-session", async (_event, target) => {
    if (typeof target !== 'string' || target.length === 0) {
      return { ok: false, reason: 'invalid_target' };
    }
    try {
      // URL scheme (cursor://, codex://, minimax://, https://)
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
        await shell.openExternal(target);
        return { ok: true, mode: 'external' };
      }
      // 绝对文件路径
      if (target.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(target)) {
        const err = await shell.openPath(target);
        if (err) return { ok: false, reason: 'openPath_failed', error: err };
        return { ok: true, mode: 'openPath' };
      }
      return { ok: false, reason: 'unrecognized_target' };
    } catch (err) {
      mainLog.warn("[ipc] ai-sessions:open-session failed", { target, msg: err.message });
      return { ok: false, reason: 'threw', error: err.message };
    }
  });

  // ── Phase B6c: AI Sessions Settings (云端API key + config) ─────
  //6 个新通道:
  // - ai-sessions:set-key —safeStorage存 API key
  // - ai-sessions:clear-key —safeStorage删 API key
  // - ai-sessions:has-key —探测某 providerId 有没存 key (不返 key本身)
  // - ai-sessions:healthcheck —跑当前 / 指定 provider 健康检查
  // - ai-sessions:get-config —读 state.json ai_sessions_config
  // - ai-sessions:save-config —写 state.json ai_sessions_config +推事件

  ipcMain.handle("ai-sessions:set-key", async (_event, providerId, apiKey) => {
    if (typeof providerId !== "string" || !/^[a-z0-9_-]+$/i.test(providerId)) {
      return { ok: false, reason: "invalid_providerId" };
    }
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      return { ok: false, reason: "invalid_apiKey" };
    }
    try {
      const r = aiStorage.saveApiKey(providerId, apiKey);
      if (!r) {
        return { ok: false, reason: "safeStorage_unavailable" };
      }
      mainLog.info(`[ipc] ai-sessions:set-key ok provider=${providerId}`);
      return { ok: true };
    } catch (err) {
      mainLog.warn("[ipc] ai-sessions:set-key threw", {
        providerId,
        msg: err.message,
      });
      return { ok: false, reason: "threw", error: err.message };
    }
  });

  ipcMain.handle("ai-sessions:clear-key", async (_event, providerId) => {
    if (typeof providerId !== "string" || !/^[a-z0-9_-]+$/i.test(providerId)) {
      return { ok: false, reason: "invalid_providerId" };
    }
    try {
      const r = aiStorage.clearApiKey(providerId);
      return { ok: true, cleared: r };
    } catch (err) {
      mainLog.warn("[ipc] ai-sessions:clear-key threw", {
        providerId,
        msg: err.message,
      });
      return { ok: false, reason: "threw", error: err.message };
    }
  });

  ipcMain.handle("ai-sessions:has-key", async (_event, providerId) => {
    if (typeof providerId !== "string" || !/^[a-z0-9_-]+$/i.test(providerId)) {
      return {
        ok: false,
        hasKey: false,
        available: false,
        reason: "invalid_providerId",
      };
    }
    const available = aiStorage.isAvailable();
    if (!available) {
      return { ok: true, hasKey: false, available: false };
    }
    // 不直接返 key (安全);只探测 key file存在
    const ss = (() => {
      try {
        return require("electron").safeStorage;
      } catch {
        return null;
      }
    })();
    const filePath = (() => {
      try {
        const { app } = require("electron");
        const path = require("path");
        return path.join(
          app.getPath("userData"),
          "ai-keys",
          `${providerId}.bin`,
        );
      } catch {
        return null;
      }
    })();
    if (!filePath) return { ok: true, hasKey: false, available: true };
    const fs = require("fs");
    const hasKey = fs.existsSync(filePath);
    return { ok: true, hasKey, available: true };
  });

  ipcMain.handle("ai-sessions:healthcheck", async (_event, opts) => {
    const stateCfg = stateStore.loadAISessionsConfig();
    const providerId =
      opts && typeof opts.providerId === "string" ? opts.providerId : "deepseek";

    // cloud：需要 apiKey
    if (!PROVIDER_ENDPOINTS[providerId]) {
      return { ok: false, error: "unsupported_providerId" };
    }

    // 优先用 opts.apiKey（用户刚输入的、可能未保存）；否则从 safeStorage 拿
    const apiKey =
      opts && typeof opts.apiKey === "string" && opts.apiKey.length > 0
        ? opts.apiKey
        : (() => {
            try {
              return aiStorage.loadApiKey(providerId);
            } catch {
              return null;
            }
          })();
    if (!apiKey) return { ok: false, error: "api_key_missing" };

    const model =
      opts && typeof opts.model === "string" && opts.model.length > 0
        ? opts.model
        : (stateCfg && stateCfg.cloud && stateCfg.cloud.model) || "gpt-4o-mini";

    const httpClient = new HttpClient({ timeout: 10_000, maxRetries: 0 });
    const tmp = new CloudSummarizer();
    try {
      return await tmp.healthcheck({
        provider: providerId,
        model,
        httpClient,
        config: {
          providerId,
          model,
          apiKey,
          baseUrl:
            opts && typeof opts.baseUrl === "string" && opts.baseUrl.length > 0
              ? opts.baseUrl
              : undefined,
        },
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("ai-sessions:get-config", async () => {
    try {
      const cfg = stateStore.loadAISessionsConfig();
      return { ok: true, config: cfg };
    } catch (err) {
      mainLog.warn("[ipc] ai-sessions:get-config threw", { msg: err.message });
      return { ok: false, reason: "threw", error: err.message };
    }
  });

  ipcMain.handle("ai-sessions:save-config", async (_event, cfg) => {
    if (cfg != null && typeof cfg !== "object") {
      return { ok: false, reason: "invalid_config" };
    }
    try {
      const next = stateStore.saveAISessionsConfig(cfg);
      sendToRenderer("ai-sessions-config-updated", {
        config: next.ai_sessions_config || null,
      });
      mainLog.info(
        `[ipc] ai-sessions:save-config ok enabled=${cfg && cfg.enabled} provider=${cfg && cfg.provider}`,
      );

      // 重建 wiring，让后续生成使用最新的 provider/model/key
      try {
        const baseCfg = global.__pulse_aiSessionsBaseCfg || {
          enabled: false,
          provider: "minimax",
          cloud: null,
        };
        const { buildTaskSummaryEngine } = require("../ai-sessions/wiring");
        const wiring = buildTaskSummaryEngine({
          config: baseCfg,
          runtimeOverride: stateStore.loadAISessionsConfig(),
          log: {
            info: (...a) => mainLog.info(...a),
            warn: (...a) => mainLog.warn(...a),
            error: (...a) => mainLog.error(...a),
          },
        });
        global.__pulse_aiTasks = wiring;
      } catch (e) {
        mainLog.warn("[ipc] ai-sessions:save-config failed to rebuild wiring", {
          msg: e && e.message,
        });
      }

      return { ok: true, config: next.ai_sessions_config || null };
    } catch (err) {
      mainLog.warn("[ipc] ai-sessions:save-config threw", { msg: err.message });
      return { ok: false, reason: "threw", error: err.message };
    }
  });

  // ── v2.7.0 (My Apps Library): library 块 IPC ─────
  // 7 个新通道, 全部走 config-store 写盘 + 推 config-updated 事件:
  //   - library:list-unmonitored — 扫盘 + 过滤已监控 + 过滤已 ignored
  //   - library:add             — 把一个 scanned app 加进 config.apps (caller 选好 detector)
  //   - library:remove          — 从 config.apps 删一个 app
  //   - library:set-sort-by     — library.sortBy
  //   - library:set-pinned      — 整个 pinned 数组 (replace, 不 merge)
  //   - library:set-ignored     — 整个 ignored 数组 (replace)
  //   - library:set-tags        — 整个 tags map (replace)

  /**
   * 通用 helper: 写新 config, 推事件, 返回 sanitize 后形态.
   * 失败统一走 ok:false + reason.
   */
  function _saveAndNotify(next) {
    try {
      const saved = configStore.saveConfig(next, {
        configPath: typeof getConfigPath === "function" ? getConfigPath() : undefined,
      });
      if (typeof onConfigUpdated === "function") {
        onConfigUpdated(saved);
      }
      sendToRenderer("config-updated", { config: saved });
      return { ok: true, config: saved };
    } catch (err) {
      mainLog.warn("[ipc] library save threw", { msg: err && err.message });
      return { ok: false, reason: "threw", error: err && err.message };
    }
  }

  ipcMain.handle("library:list-unmonitored", () => {
    try {
      const cfg = getConfig() || { apps: [], library: { ignored: [] } };
      const scanned = libraryScanner.scanInstalledApps();
      const unmonitored = libraryScanner.filterUnmonitored(
        scanned,
        cfg.apps,
        (cfg.library && cfg.library.ignored) || [],
      );
      return { ok: true, unmonitored, total: scanned.length };
    } catch (err) {
      mainLog.warn("[ipc] library:list-unmonitored threw", {
        msg: err && err.message,
      });
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  /**
   * 把 scanned app 加进 config.apps. caller 传: { appName, bundleName, detectors }
   * detectors 数组由 renderer 端的 detector wizard 选好, 至少 1 个, type 必须在合法集合.
   */
  ipcMain.handle("library:add", (_event, opts) => {
    const cfg = getConfig() || { apps: [], library: { pinned: [], ignored: [], tags: {} } };
    const r = libraryOps.addApp(cfg, opts);
    if (!r.ok) return r;
    return _saveAndNotify(r.config);
  });

  ipcMain.handle("library:remove", (_event, name) => {
    const cfg = getConfig() || { apps: [], library: {} };
    const r = libraryOps.removeApp(cfg, name);
    if (!r.ok) return r;
    return _saveAndNotify(r.config);
  });

  ipcMain.handle("library:set-sort-by", (_event, sortBy) => {
    const cfg = getConfig() || { apps: [], library: {} };
    const r = libraryOps.setSortBy(cfg, sortBy);
    if (!r.ok) return r;
    return _saveAndNotify(r.config);
  });

  ipcMain.handle("library:set-pinned", (_event, pinned) => {
    const cfg = getConfig() || { apps: [], library: {} };
    const r = libraryOps.setPinned(cfg, pinned);
    if (!r.ok) return r;
    return _saveAndNotify(r.config);
  });

  ipcMain.handle("library:set-ignored", (_event, ignored) => {
    const cfg = getConfig() || { apps: [], library: {} };
    const r = libraryOps.setIgnored(cfg, ignored);
    if (!r.ok) return r;
    return _saveAndNotify(r.config);
  });

  ipcMain.handle("library:set-tags", (_event, tags) => {
    const cfg = getConfig() || { apps: [], library: {} };
    const r = libraryOps.setTags(cfg, tags);
    if (!r.ok) return r;
    return _saveAndNotify(r.config);
  });

  // ── v2.7.2 (Library Auto-Detect): 1 步探查, 返 best detector 跟 results
  // 取代 v2.7.0/v2.7.1 wizard (3 步手选) — 用户零负担
  // 进度通过 pushEvent (不返 stream) — UI 端 "探查中..." 用本地状态, 完成后弹结果
  ipcMain.handle("library:auto-detect", async (_event, item) => {
    if (!item || typeof item !== "object") {
      return { ok: false, reason: "invalid_item" };
    }
    try {
      const r = await libraryDetect.detectDetector(item);
      return { ok: true, results: r.results, best: r.best };
    } catch (err) {
      mainLog.warn("[ipc] library:auto-detect threw", {
        msg: err && err.message,
      });
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerIpcHandlers };
