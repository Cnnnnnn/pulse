const { ipcMain } = require("electron");
const { runCheckQueued } = require("../check-runner");
const { runBulkUpgrade } = require("../bulk-upgrade");
const stateStore = require("../state-store");
const { aggregate } = require("../digest/aggregate");
const platform = require("../../platform");
const { mainLog } = require("../log");
const lastOpened = require("../last-opened");
const recentActivity = require("../recent-activity");
const versionHistory = require("../version-history");
const backup = require("../backup");
const rollback = require("../rollback");
const { resolveAppBundlePath } = require("../../utils/app-paths");

let bulkUpgradeCtrl = null;
let bulkUpgradeRunning = false;

/**
 * Push current per-app history counts to renderer.
 * 挂在: check-updates 完成 / bulk-upgrade 完成 / rollback / delete 之后.
 * renderer ⏪ 按钮 + 角标靠这个 signal 触发 re-render.
 */
function broadcastVersionHistoryCounts(sendToRenderer) {
  if (typeof sendToRenderer !== "function") return;
  try {
    const counts = versionHistory.getAllCounts();
    const totalSizeBytes = versionHistory.getTotalSize();
    sendToRenderer("version-history-counts-updated", { counts, totalSizeBytes });
  } catch (err) {
    mainLog.warn("[ipc] broadcastVersionHistoryCounts failed", { msg: err && err.message });
  }
}

function registerCoreHandlers(ctx) {
  const {
    getConfig,
    pool,
    getWindow,
    onCheckComplete,
    getCachedState,
    sendToRenderer,
    safeHandle,
  } = ctx;

  ipcMain.handle("get-config", () => {
    try {
      return getConfig();
    } catch {
      return { check_on_launch: true, apps: [] };
    }
  });

  ipcMain.handle("get-cached-state", () => {
    if (typeof getCachedState !== "function") return null;
    try {
      return getCachedState();
    } catch {
      return null;
    }
  });

  ipcMain.handle("check-updates", async () => {
    const r = await runCheckQueued(
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
    // check 完成后, versionHistory counts 不变, 但 broadcast 一下保持 renderer 心跳一致
    broadcastVersionHistoryCounts(sendToRenderer);
    // I2 v1: pinned app 独立通知 (走 electron.Notification + inQuietHours)
    try {
      const { checkWatchlistUpdates } = require("../watchlist");
      const { Notification: ElectronNotification } = require("electron");
      const sendNotification = (n) => {
        if (
          !ElectronNotification.isSupported ||
          !ElectronNotification.isSupported()
        ) {
          return;
        }
        new ElectronNotification({
          title: n.title,
          body: n.body,
          silent: false,
        });
      };
      checkWatchlistUpdates({ results: r, sendNotification });
    } catch (err) {
      mainLog.warn(
        `[ipc] check-updates watchlist hook failed: ${err && err.message}`,
      );
    }
    return r;
  });

  ipcMain.handle("brew-upgrade", async (_event, caskName) => {
    if (!caskName) return { success: false, output: "no cask" };
    const r = await pool.enqueue({
      type: "brew-upgrade",
      payload: { cask: caskName },
    });
    if (r && r.success) {
      try {
        recentActivity.push({
          kind: "app-upgrade",
          ref: String(caskName),
          label: `${caskName} 已升级`,
        });
      } catch {
        /* noop */
      }
    }
    return r;
  });

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

    runBulkUpgrade({
      items,
      signal: ctrl.signal,
      onProgress: (evt) => {
        sendToRenderer("bulk-upgrade:progress", evt);
      },
    })
      .then((summary) => {
        try {
          for (const s of summary.succeeded || []) {
            const item = items.find((i) => i.id === s.id);
            if (item && item.name) {
              recentActivity.push({
                kind: "app-upgrade",
                ref: item.name,
                label: `${item.name} 已升级`,
              });
            }
          }
        } catch {
          /* noop */
        }
        sendToRenderer("bulk-upgrade:done", summary);
        // bulk-upgrade 里有 brew 类型, 每次会 backup + recordUpgrade → versionHistory 变了
        broadcastVersionHistoryCounts(sendToRenderer);
        if (ctrl === bulkUpgradeCtrl) {
          bulkUpgradeCtrl = null;
          bulkUpgradeRunning = false;
        }
      })
      .catch((err) => {
        sendToRenderer("bulk-upgrade:done", {
          succeeded: [],
          failed: [{ id: "?", error: (err && err.message) || "unknown" }],
          skipped: [],
          cancelled: false,
        });
        // catch 路径下 bulk-upgrade 可能已经部分成功, broadcast 一次保证 renderer 同步
        broadcastVersionHistoryCounts(sendToRenderer);
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

  ipcMain.handle("get-app-icon", async (_event, bundlePath) => {
    try {
      const dataUrl = await platform.getAppIcon(bundlePath);
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

  // Win 走 titleBarStyle:'hidden' 把 OS 三键隐藏, renderer 画三个按钮调这里.
  // mac 走 hiddenInset 自带三颗灯, 不调这里. 不做平台守卫 — 调了也对 mac 无副作用
  // (Win 上 hide 行为已存在, mac 上 minimize/close 走 hide 同路径, maximize 走 OS 全屏).
  ipcMain.handle("window:minimize", () => {
    const w = getWindow();
    if (w && !w.isDestroyed()) w.minimize();
  });
  ipcMain.handle("window:toggle-maximize", () => {
    const w = getWindow();
    if (!w || w.isDestroyed()) return { maximized: false };
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
    return { maximized: w.isMaximized() };
  });
  ipcMain.handle("window:close", () => {
    // 走 window.close() 让 isQuitting 守卫在 window.js 接管:
    //   - quit 中 (Cmd+Q / tray quit) → 真退出
    //   - 否则 → hide (tray 模式)
    // 不要直接 w.destroy(), 否则 tray 模式窗口再开不回来.
    const w = getWindow();
    if (w && !w.isDestroyed()) w.close();
  });

  ipcMain.handle("get-mutes", () => {
    try {
      return { mutes: stateStore.getMutes() };
    } catch (err) {
      mainLog.warn("[ipc] get-mutes threw", { msg: err && err.message });
      return { mutes: {} };
    }
  });

  safeHandle(
    "set-mute",
    (_event, name, durationSec) => {
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
      const untilMs = durationSec === 0 ? 0 : Date.now() + durationSec * 1000;
      const next = stateStore.setMute(name, untilMs, "manual");
      return { ok: true, mutes: next.mutes };
    },
    {
      logMeta: (_evt, name) => ({ name }),
      onError: () => ({
        ok: false,
        reason: "threw",
        mutes: stateStore.getMutes(),
      }),
    },
  );

  safeHandle(
    "clear-mute",
    (_event, name) => {
      if (!name || typeof name !== "string") {
        return {
          ok: false,
          reason: "invalid_name",
          mutes: stateStore.getMutes(),
        };
      }
      const next = stateStore.clearMute(name);
      return { ok: true, mutes: next.mutes };
    },
    {
      logMeta: (_evt, name) => ({ name }),
      onError: () => ({
        ok: false,
        reason: "threw",
        mutes: stateStore.getMutes(),
      }),
    },
  );

  ipcMain.handle("get-last-opened", () => {
    try {
      return { lastOpened: stateStore.loadLastOpened() };
    } catch (err) {
      mainLog.warn("[ipc] get-last-opened threw", { msg: err && err.message });
      return { lastOpened: {} };
    }
  });

  ipcMain.handle("refresh-last-opened", () => {
    const apps = (getConfig() && getConfig().apps) || [];
    const refreshable = apps.filter((a) => a && a.name && a.bundle);
    if (refreshable.length === 0) {
      return { ok: true, count: 0 };
    }
    (async () => {
      try {
        const next = {};
        await Promise.all(
          refreshable.map(async (a) => {
            const bundlePath = platform.resolveAppPath(a.bundle, a);
            try {
              const r = await lastOpened.refreshOne(bundlePath);
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

  safeHandle(
    "save-active-category",
    (_event, id) => {
      if (typeof id !== "string" || id.length === 0) {
        return {
          ok: false,
          reason: "invalid_id",
          activeCategory: stateStore.loadActiveCategory(),
        };
      }
      const next = stateStore.saveActiveCategory(id);
      return { ok: true, activeCategory: next.active_category };
    },
    {
      logMeta: (_evt, id) => ({ id }),
      onError: () => ({
        ok: false,
        reason: "threw",
        activeCategory: stateStore.loadActiveCategory(),
      }),
    },
  );

  // Phase I5: digest IPC handlers
  safeHandle("digest:fetch-sections", () => {
    try {
      const state = stateStore.load() || {};
      const result = aggregate(state, { now: new Date() });
      return { ok: true, ...result };
    } catch (err) {
      return {
        ok: false,
        reason: "threw",
        error: err && err.message,
        sections: [],
        lines: [],
      };
    }
  });

  safeHandle("digest:update-settings", (_event, cfg) => {
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
      return { ok: false, reason: "bad_cfg" };
    }
    try {
      stateStore.saveDailyDigest({
        enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : undefined,
        time: typeof cfg.time === "string" ? cfg.time : undefined,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  // Phase Q6: error aggregator IPC handlers
  safeHandle("error:fetch-entries", async (_event, opts) => {
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      if (!inst)
        return {
          ok: false,
          reason: "not_initialized",
          entries: [],
          stats: { total: 0, byLevel: {}, skipped: 0 },
        };
      const r = await inst.aggregator.query(opts || {});
      return {
        ok: true,
        entries: r.entries || [],
        stats: r.stats || { total: 0, byLevel: {}, skipped: 0 },
      };
    } catch (err) {
      return {
        ok: false,
        reason: "threw",
        error: err && err.message,
        entries: [],
        stats: { total: 0, byLevel: {}, skipped: 0 },
      };
    }
  });

  safeHandle("error:copy-all", () => {
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      if (!inst)
        return Promise.resolve({
          ok: false,
          reason: "not_initialized",
          text: "",
        });
      return inst.aggregator.query({}).then((r) => ({
        ok: true,
        text: (r.entries || []).map((e) => JSON.stringify(e)).join("\n"),
      }));
    } catch (err) {
      return Promise.resolve({
        ok: false,
        reason: "threw",
        error: err && err.message,
        text: "",
      });
    }
  });

  safeHandle("error:export-zip", async () => {
    // Phase Q1 v2: 真实导出 — 把 errors-*.jsonl + raw 日志 + diagnostics
    // 合成一个 .tar.gz 写到桌面. 复用 diagnostics-aggregator.bundleDiagnostics.
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const { bundleDiagnostics } = require("../diagnostics-aggregator");
      const { resolveLogDir } = require("../log");
      const diagnostics = require("../diagnostics");
      const inst = getInstance();
      const mainLogDir = resolveLogDir();
      const errLogDir = inst && inst.aggregator && inst.aggregator.logsDir;
      // 启动 metrics 摘要塞到 extras — drawer 里点导出时已经把当前快照打包.
      const startup = diagnostics.getStartup();
      const metrics = diagnostics.getMetricsSummary();
      const r = await bundleDiagnostics({
        logsDir: errLogDir,
        extraLogsDirs: [mainLogDir].filter((d) => d && d !== errLogDir),
        aggregator: inst && inst.aggregator,
        extras: { startup, metrics },
        // outputDir 默认 ~/Desktop (bundleDiagnostics 内置)
      });
      if (!r.ok) return { ok: false, reason: r.error || "bundle_failed" };
      return { ok: true, path: r.path, sizeBytes: r.sizeBytes, fileCount: r.fileCount };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  // Phase Q1 v2: diagnostics IPC — drawer 一次拉全 (startup + metrics + top-5)
  safeHandle("diagnostics:fetch", async (_event, opts) => {
    try {
      const { getStartup, getMetricsSummary } = require("../diagnostics");
      const { computeTopFailures } = require("../diagnostics-aggregator");
      const { getInstance } = require("../bootstrap/error-init");
      const sinceMs =
        (opts && typeof opts.sinceMs === "number" && opts.sinceMs) ||
        Date.now() - 7 * 24 * 60 * 60 * 1000;
      const topN = (opts && typeof opts.topN === "number" && opts.topN > 0) ? opts.topN : 5;
      const inst = getInstance();
      let entries = [];
      let stats = { total: 0, byLevel: {}, skipped: 0 };
      if (inst && inst.aggregator && typeof inst.aggregator.query === "function") {
        try {
          const r = await inst.aggregator.query({ since: sinceMs, limit: 5000 });
          entries = r.entries || [];
          stats = r.stats || stats;
        } catch { /* noop */ }
      }
      return {
        ok: true,
        startup: getStartup(),
        metrics: getMetricsSummary(),
        topFailures: computeTopFailures(entries, topN),
        stats,
        sinceMs,
      };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  // Phase Q1 v2: 拉 ring buffer (60 帧) 给 drawer "近期趋势" 用
  safeHandle("diagnostics:fetch-samples", () => {
    try {
      const { getSamples } = require("../diagnostics");
      return { ok: true, samples: getSamples() };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  // Phase I2 v1: watchlist IPC (pinned apps)
  safeHandle("watchlist:list", () => {
    try {
      const { loadWatchlist } = require("../state-store");
      return { ok: true, items: loadWatchlist() };
    } catch (err) {
      return { ok: false, reason: "load_failed", error: err && err.message };
    }
  });

  safeHandle("watchlist:add", (_e, payload) => {
    try {
      const { loadWatchlist, saveWatchlist } = require("../state-store");
      const legacyName = payload && payload.appName;
      const type =
        payload && typeof payload.type === "string"
          ? payload.type
          : legacyName
            ? "app"
            : null;
      const ref =
        payload && typeof payload.ref === "string"
          ? payload.ref.trim()
          : typeof legacyName === "string"
            ? legacyName
            : "";
      if (!type || !ref) {
        return { ok: false, reason: "invalid_payload" };
      }
      if (!["app", "fund", "keyword"].includes(type)) {
        return { ok: false, reason: "invalid_type" };
      }
      if (type === "fund" && !/^\d{6}$/.test(ref)) {
        return { ok: false, reason: "invalid_fund_code" };
      }
      if (type === "keyword" && ref.length > 40) {
        return { ok: false, reason: "keyword_too_long" };
      }
      const list = loadWatchlist();
      if (list.some((w) => w.type === type && w.ref === ref)) {
        return { ok: true, items: list };
      }
      const entry = { type, ref, addedAt: Date.now() };
      if (type === "app") entry.lastNotifiedVersion = null;
      if (type === "fund") entry.lastNotifiedNav = null;
      if (type === "keyword") entry.lastMatchKey = null;
      const next = [...list, entry];
      saveWatchlist(next);
      return { ok: true, items: next };
    } catch (err) {
      return { ok: false, reason: "save_failed", error: err && err.message };
    }
  });

  safeHandle("watchlist:remove", (_e, payload) => {
    try {
      const { loadWatchlist, saveWatchlist, watchlistItemKey } =
        require("../state-store");
      const legacyName = payload && payload.appName;
      const type =
        payload && typeof payload.type === "string"
          ? payload.type
          : legacyName
            ? "app"
            : null;
      const ref =
        payload && typeof payload.ref === "string"
          ? payload.ref
          : typeof legacyName === "string"
            ? legacyName
            : "";
      if (!type || !ref) {
        return { ok: false, reason: "invalid_payload" };
      }
      const key = `${type}:${ref}`;
      const list = loadWatchlist();
      const next = list.filter((w) => watchlistItemKey(w) !== key);
      saveWatchlist(next);
      return { ok: true, items: next };
    } catch (err) {
      return { ok: false, reason: "save_failed", error: err && err.message };
    }
  });

  safeHandle("error:clear-old", () => {
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      if (!inst)
        return Promise.resolve({
          ok: false,
          reason: "not_initialized",
          removed: 0,
        });
      return inst.aggregator
        .cleanup()
        .then((removed) => ({ ok: true, removed }));
    } catch (err) {
      return Promise.resolve({
        ok: false,
        reason: "threw",
        error: err && err.message,
        removed: 0,
      });
    }
  });

  safeHandle("error:open-folder", () => {
    try {
      const { shell } = require("electron");
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      const dir = inst && inst.aggregator && inst.aggregator.logsDir;
      if (!dir) return { ok: false, reason: "no_dir" };
      shell.openPath(dir);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("error:report", (_event, entry) => {
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      if (!inst || !entry) return { ok: false, reason: "no_instance_or_entry" };
      return inst.aggregator
        .append({
          source: "renderer",
          level: entry.level || "error",
          message: entry.message || "unknown",
          stack: entry.stack || "",
          context: { ...(entry.context || {}), kind: "renderer-report" },
        })
        .then((e) => ({ ok: true, id: e.id }));
    } catch (err) {
      return Promise.resolve({
        ok: false,
        reason: "threw",
        error: err && err.message,
      });
    }
  });

  // Phase C3: app rollback IPC handlers
  safeHandle("get-version-history", (_event, appName) => {
    if (!appName || typeof appName !== "string") {
      return { ok: false, reason: "bad_name", entries: [], totalSizeBytes: 0 };
    }
    try {
      const entries = versionHistory.listHistory(appName);
      const totalSizeBytes = versionHistory.getTotalSize();
      return { ok: true, entries, totalSizeBytes };
    } catch (err) {
      mainLog.warn("[ipc] get-version-history threw", { msg: err && err.message });
      return { ok: false, reason: "threw", entries: [], totalSizeBytes: 0 };
    }
  });

  safeHandle(
    "rollback-app",
    async (_event, appName, toVersion) => {
      if (!appName || typeof appName !== "string" || !toVersion || typeof toVersion !== "string") {
        return { ok: false, reason: "invalid_args" };
      }
      const apps = (getConfig() && getConfig().apps) || [];
      const appCfg = apps.find((a) => a && a.name === appName);
      if (!appCfg || !appCfg.bundle) {
        return { ok: false, reason: "app_not_found" };
      }
      const entries = versionHistory.listHistory(appName);
      const entry = entries.find((e) => e.to === toVersion);
      if (!entry) {
        return { ok: false, reason: "history_not_found" };
      }
      const targetAppPath = resolveAppBundlePath(appCfg.bundle);
      try {
        const r = await rollback.doRollback({
          appName,
          bundleName: appCfg.bundle,
          targetAppPath,
          backupPath: entry.backupPath,
          rollbackToVersion: toVersion,
          currentInstalledVersion:
            (appCfg.installed_version || appCfg.latest_version || "").toString() || "unknown",
          onUpdateInstalled: (newVer) => {
            try {
              // 写 apps[appName].installed_version — 通过 saveAll 单条模式,
              // 但更简单是直接调 state-store 的 patch 范式. 这里走 setAppInstalledVersion
              // helper (在 state-store.js 末尾新增 — 见 Task 6).
              stateStore.saveAppInstalledVersion(appName, newVer);
            } catch (err) {
              mainLog.warn("[ipc] rollback-app: onUpdateInstalled failed", {
                msg: err && err.message,
              });
            }
          },
          onActivity: (payload) => {
            try {
              recentActivity.push(payload);
            } catch (err) {
              mainLog.warn("[ipc] rollback-app: onActivity failed", { msg: err && err.message });
            }
          },
          onBroadcast: (event, payload) => {
            try {
              sendToRenderer(event, payload);
            } catch (err) {
              mainLog.warn("[ipc] rollback-app: onBroadcast failed", { msg: err && err.message });
            }
          },
        });
        // rollback 成功后: onUpdateInstalled 写 installed_version, doRollback broadcast
        // version-history-updated. 这里再推一次 counts 兜底 (renderer drawer 也在听).
        broadcastVersionHistoryCounts(sendToRenderer);
        return r;
      } catch (err) {
        mainLog.warn("[ipc] rollback-app threw", { msg: err && err.message });
        return { ok: false, reason: "threw", error: err && err.message };
      }
    },
    {
      logMeta: (_evt, appName, toVersion) => ({ appName, toVersion }),
      onError: () => ({ ok: false, reason: "threw" }),
    },
  );

  safeHandle(
    "delete-backup",
    (_event, appName, version) => {
      if (!appName || typeof appName !== "string" || !version || typeof version !== "string") {
        return { ok: false, reason: "invalid_args" };
      }
      try {
        const { app: electronApp } = require("electron");
        const userDataDir =
          electronApp && typeof electronApp.getPath === "function"
            ? electronApp.getPath("userData")
            : null;
        let freed = 0;
        if (userDataDir) {
          // 用 appName 作为 bundleName 兜底 (caller 应该传 bundleName)
          // 这里 entries 里存的 backupPath 是 .../<bundleName>/<version>.app
          // 我们需要 bundleName 来定位目录 — 从 config 找
          const apps = (getConfig() && getConfig().apps) || [];
          const appCfg = apps.find((a) => a && a.name === appName);
          const bundleName = (appCfg && appCfg.bundle) || appName;
          freed = backup.deleteBackup(bundleName, version, { userDataDir });
        }
        // 再删 state entry
        const stateFreed = versionHistory.deleteEntry(appName, version);
        // delete 后 count 会变, broadcast 让 renderer ⏪ 角标立即更新
        broadcastVersionHistoryCounts(sendToRenderer);
        return { ok: true, freedBytes: freed + stateFreed };
      } catch (err) {
        mainLog.warn("[ipc] delete-backup threw", { msg: err && err.message });
        return { ok: false, reason: "threw" };
      }
    },
    {
      logMeta: (_evt, appName, version) => ({ appName, version }),
      onError: () => ({ ok: false, reason: "threw" }),
    },
  );

  // Phase C2: per-app snooze IPC handlers
  safeHandle("snooze:set", (_event, name, opts) => {
    if (!name || typeof name !== "string")
      return { ok: false, reason: "bad_name" };
    if (!opts || typeof opts !== "object" || Array.isArray(opts))
      return { ok: false, reason: "bad_opts" };
    try {
      stateStore.setAppSnooze(name, opts);
      return { ok: true, name };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("snooze:clear", (_event, name) => {
    if (!name || typeof name !== "string")
      return { ok: false, reason: "bad_name" };
    try {
      stateStore.clearAppSnooze(name);
      return { ok: true, name };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  // C7 v2.35.0: 检测结果导出 (JSON / CSV → 桌面)
  safeHandle("detect-results:export", async (_event, opts) => {
    try {
      const { exportDetectResults } = require("../detect-results-export");
      const format = opts && opts.format;
      let state = null;
      if (typeof getCachedState === "function") {
        try {
          state = getCachedState();
        } catch { /* noop */ }
      }
      let pulseVersion = "";
      try {
        pulseVersion = require("../../../package.json").version || "";
      } catch { /* noop */ }
      const r = exportDetectResults({ state, format, pulseVersion });
      if (!r.ok) return { ok: false, reason: r.error || "export_failed" };
      return {
        ok: true,
        path: r.path,
        sizeBytes: r.sizeBytes,
        rowCount: r.rowCount,
        format,
      };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerCoreHandlers };
