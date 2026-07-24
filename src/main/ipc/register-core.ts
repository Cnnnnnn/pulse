// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type { IpcMain } from "electron";
const { ipcMain }: { ipcMain: IpcMain } = require("electron");
const { runCheckQueued } = require("../check-runner.ts");
const { buildRunCheckDeps } = require("../run-check-deps.ts");
const { runBulkUpgrade } = require("../bulk-upgrade.ts");
const stateStore = require("../state-store.ts");
const { aggregate } = require("../digest/aggregate.ts");
const platform = require("../../platform/index.ts");
const { mainLog } = require("../log.ts");
const lastOpened = require("../last-opened.ts");
const recentActivity = require("../recent-activity.ts");
const { resolveAppBundlePath } = require("../../utils/app-paths");

let bulkUpgradeCtrl = null;
let bulkUpgradeRunning = false;

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
      buildRunCheckDeps({
        getConfig,
        pool,
        getWindow,
        onCheckComplete,
        stateStore,
      }),
      { silent: false },
    );
    // (C3 version history 已退役, 不再 broadcast counts)
    // I2 v1: pinned app 独立通知 (走 electron.Notification + inQuietHours)
    try {
      const { checkWatchlistUpdates } = require("../watchlist.ts");
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
        // (C3 version history 已退役, 不再 broadcast counts)
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
        // (C3 version history 已退役, 不再 broadcast counts)
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

  // P-N: HomeGrid 落点
  ipcMain.handle("get-last-active-nav", () => {
    try {
      return { lastActiveNav: stateStore.loadLastActiveNav() };
    } catch (err) {
      mainLog.warn("[ipc] get-last-active-nav threw", {
        msg: err && err.message,
      });
      return { lastActiveNav: null };
    }
  });

  safeHandle(
    "save-last-active-nav",
    (_event, key) => {
      if (typeof key !== "string" || key.length === 0) {
        return {
          ok: false,
          reason: "invalid_key",
          lastActiveNav: stateStore.loadLastActiveNav(),
        };
      }
      try {
        const next = stateStore.saveLastActiveNav(key);
        return { ok: true, lastActiveNav: next.last_active_nav };
      } catch (err) {
        if (err && err.name === "TypeError") {
          return {
            ok: false,
            reason: "invalid_key",
            lastActiveNav: stateStore.loadLastActiveNav(),
          };
        }
        throw err;
      }
    },
    {
      logMeta: (_evt, key) => ({ key }),
      onError: () => ({
        ok: false,
        reason: "threw",
        lastActiveNav: stateStore.loadLastActiveNav(),
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
      const { getInstance } = require("../bootstrap/error-init.ts");
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
      const { getInstance } = require("../bootstrap/error-init.ts");
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
      const { getInstance } = require("../bootstrap/error-init.ts");
      const { bundleDiagnostics } = require("../diagnostics-aggregator.ts");
      const { resolveLogDir } = require("../log.ts");
      const diagnostics = require("../diagnostics.ts");
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
      return {
        ok: true,
        path: r.path,
        sizeBytes: r.sizeBytes,
        fileCount: r.fileCount,
      };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  // Phase Q1 v2: diagnostics IPC — drawer 一次拉全 (startup + metrics + top-5)
  safeHandle("diagnostics:fetch", async (_event, opts) => {
    try {
      const { getStartup, getMetricsSummary } = require("../diagnostics.ts");
      const { computeTopFailures } = require("../diagnostics-aggregator.ts");
      const { getInstance } = require("../bootstrap/error-init.ts");
      const sinceMs =
        (opts && typeof opts.sinceMs === "number" && opts.sinceMs) ||
        Date.now() - 7 * 24 * 60 * 60 * 1000;
      const topN =
        opts && typeof opts.topN === "number" && opts.topN > 0 ? opts.topN : 5;
      const inst = getInstance();
      let entries = [];
      let stats = { total: 0, byLevel: {}, skipped: 0 };
      if (
        inst &&
        inst.aggregator &&
        typeof inst.aggregator.query === "function"
      ) {
        try {
          const r = await inst.aggregator.query({
            since: sinceMs,
            limit: 5000,
          });
          entries = r.entries || [];
          stats = r.stats || stats;
        } catch {
          /* noop */
        }
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
      const { getSamples } = require("../diagnostics.ts");
      return { ok: true, samples: getSamples() };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  // Phase I2 v1: watchlist IPC (pinned apps)
  safeHandle("watchlist:list", () => {
    try {
      return { ok: true, items: stateStore.loadWatchlist() };
    } catch (err) {
      return { ok: false, reason: "load_failed", error: err && err.message };
    }
  });

  safeHandle("watchlist:add", (_e, payload) => {
    try {
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
      if (!["app", "fund", "keyword", "metal"].includes(type)) {
        return { ok: false, reason: "invalid_type" };
      }
      if (type === "fund" && !/^\d{6}$/.test(ref)) {
        return { ok: false, reason: "invalid_fund_code" };
      }
      if (type === "keyword" && ref.length > 40) {
        return { ok: false, reason: "keyword_too_long" };
      }
      if (type === "metal") {
        const { METAL_IDS } = require("../../metals/metal-config");
        if (!METAL_IDS.includes(ref)) {
          return { ok: false, reason: "invalid_metal_id" };
        }
      }
      const list = stateStore.loadWatchlist();
      if (list.some((w) => w.type === type && w.ref === ref)) {
        return { ok: true, items: list };
      }
      const entry: Record<string, unknown> = { type, ref, addedAt: Date.now() };
      if (type === "app") entry.lastNotifiedVersion = null;
      if (type === "fund") entry.lastNotifiedNav = null;
      if (type === "keyword") entry.lastMatchKey = null;
      if (type === "metal") entry.lastNotifiedPrice = null;
      const next = [...list, entry];
      stateStore.saveWatchlist(next);
      return { ok: true, items: next };
    } catch (err) {
      return { ok: false, reason: "save_failed", error: err && err.message };
    }
  });

  safeHandle("watchlist:remove", (_e, payload) => {
    try {
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
      const list = stateStore.loadWatchlist();
      const next = list.filter((w) => stateStore.watchlistItemKey(w) !== key);
      stateStore.saveWatchlist(next);
      return { ok: true, items: next };
    } catch (err) {
      return { ok: false, reason: "save_failed", error: err && err.message };
    }
  });

  safeHandle("error:clear-old", () => {
    try {
      const { getInstance } = require("../bootstrap/error-init.ts");
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
      const { getInstance } = require("../bootstrap/error-init.ts");
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
      const { getInstance } = require("../bootstrap/error-init.ts");
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

  // C7 v2.35.0: 检测结果导出 (JSON / CSV → 桌面)
  safeHandle("detect-results:export", async (_event, opts) => {
    try {
      const { exportDetectResults } = require("../detect-results-export.ts");
      const format = opts && opts.format;
      let state = null;
      if (typeof getCachedState === "function") {
        try {
          state = getCachedState();
        } catch {
          /* noop */
        }
      }
      let pulseVersion = "";
      try {
        pulseVersion = require("../../../package.json").version || "";
      } catch {
        /* noop */
      }
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
