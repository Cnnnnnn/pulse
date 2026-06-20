const { ipcMain } = require("electron");
const { runCheckQueued } = require("../check-runner");
const { runBulkUpgrade } = require("../bulk-upgrade");
const stateStore = require("../state-store");
const { aggregate } = require("../digest/aggregate");
const platform = require("../../platform");
const { mainLog } = require("../log");
const lastOpened = require("../last-opened");
const recentActivity = require("../recent-activity");

let bulkUpgradeCtrl = null;
let bulkUpgradeRunning = false;

function registerCoreHandlers(ctx) {
  const { getConfig, pool, getWindow, onCheckComplete, getCachedState, sendToRenderer, safeHandle } =
    ctx;

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
    return runCheckQueued(
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
      return { ok: false, reason: "threw", error: err && err.message, sections: [], lines: [] };
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
  safeHandle("error:fetch-entries", (_event, opts) => {
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      if (!inst) return { ok: false, reason: "not_initialized", entries: [], stats: { total: 0, byLevel: {}, skipped: 0 } };
      return inst.aggregator.query(opts || {});
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message, entries: [], stats: { total: 0, byLevel: {}, skipped: 0 } };
    }
  });

  safeHandle("error:copy-all", () => {
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      if (!inst) return Promise.resolve({ ok: false, reason: "not_initialized", text: "" });
      return inst.aggregator.query({}).then((r) => ({
        ok: true,
        text: (r.entries || []).map((e) => JSON.stringify(e)).join("\n"),
      }));
    } catch (err) {
      return Promise.resolve({ ok: false, reason: "threw", error: err && err.message, text: "" });
    }
  });

  safeHandle("error:export-zip", () => {
    // Best-effort stub: real zip export deferred. We surface the logsDir.
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      return Promise.resolve({
        ok: true,
        path: inst && inst.aggregator && inst.aggregator.logsDir,
        note: "ZIP export deferred; logs dir returned.",
      });
    } catch (err) {
      return Promise.resolve({ ok: false, reason: "threw", error: err && err.message });
    }
  });

  safeHandle("error:clear-old", () => {
    try {
      const { getInstance } = require("../bootstrap/error-init");
      const inst = getInstance();
      if (!inst) return Promise.resolve({ ok: false, reason: "not_initialized", removed: 0 });
      return inst.aggregator.cleanup().then((removed) => ({ ok: true, removed }));
    } catch (err) {
      return Promise.resolve({ ok: false, reason: "threw", error: err && err.message, removed: 0 });
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
      return inst.aggregator.append({
        source: 'renderer',
        level: entry.level || 'error',
        message: entry.message || 'unknown',
        stack: entry.stack || '',
        context: { ...(entry.context || {}), kind: 'renderer-report' },
      }).then((e) => ({ ok: true, id: e.id }));
    } catch (err) {
      return Promise.resolve({ ok: false, reason: "threw", error: err && err.message });
    }
  });

  // Phase C2: per-app snooze IPC handlers
  safeHandle("snooze:set", (_event, name, opts) => {
    if (!name || typeof name !== "string") return { ok: false, reason: "bad_name" };
    if (!opts || typeof opts !== "object" || Array.isArray(opts)) return { ok: false, reason: "bad_opts" };
    try {
      stateStore.setAppSnooze(name, opts);
      return { ok: true, name };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("snooze:clear", (_event, name) => {
    if (!name || typeof name !== "string") return { ok: false, reason: "bad_name" };
    try {
      stateStore.clearAppSnooze(name);
      return { ok: true, name };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerCoreHandlers };
