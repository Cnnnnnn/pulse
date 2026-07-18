/**
 * src/renderer/index.jsx
 *
 * 启动流程 (v2 — Session-based):
 *   1. DOMContentLoaded → bootstrap()
 *   2. getConfig() → apps.value = cfg.apps
 *   3. primeConfigCache(cfg)
 *   4. render(<App />) — Q4 v2: 尽早首屏, 不等缓存/mutes
 *   5. requestIdleCallback → 加载 cached state / mutes / AI 等
 *   6. cfg.check_on_launch → triggerCheck()
 */

import { render } from 'preact';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

console.info("[pulse] renderer bundle", "ithome-comments-fix-2026-07-18-23:50");
import {
  openReleaseNotes,
  releaseNotesPayload,
} from './release-notes-store.js';
import {
  apps,
  applyProgress,
  applyProgressBatch,
  markAppDetecting,
  startCheck,
  finishCheck,
  setError,
  isCheckRunning,
  checkSession,
  loadMutes,
  loadLastOpened,
  loadActiveCategory,
  loadAiTasks,
  subscribeAiTaskUpdates,
  subscribeAISessionsConfigUpdates,
  loadAISessionsConfig,
  lastOpenedApps,
} from './store.js';
import { api } from './api.js';
import { primeConfigCache } from './components/AppRow.jsx';
import { applyBulkUpgradeProgress, applyBulkUpgradeDone } from './store-bulk-upgrade.js';
import { createAutoRecheck } from './auto-recheck.js';
import { taggedLog } from './log.js';
import { applyPlatformBodyClass } from './platform-body-class.js';
import { initTheme, getThemePreference, setThemePreference } from './theme/theme-manager.js';
import { setActiveNav, PERSISTABLE_NAV_KEYS } from './worldcup/navStore.js';

const log = taggedLog("[index]");

import './category-init.js';

let activeRecheck = null;

async function triggerCheck() {
  if (isCheckRunning()) return;
  if (activeRecheck) activeRecheck.cancel();

  const appNames = apps.value.map(a => a.name);
  const sessionId = startCheck(appNames);

  try {
    const returned = await api.checkUpdates();
    if (checkSession.value.id === sessionId) {
      if (Array.isArray(returned) && returned.length > 0) {
        applyProgressBatch(returned, sessionId);
      }
      finishCheck();
    }
  } catch (err) {
    log.error("checkUpdates failed:", err);
    if (checkSession.value.id === sessionId) {
      setError(err && err.message || String(err));
    }
  }
}

function wireRendererListeners() {
  api.onLastOpenedUpdated((data) => {
    if (!data || !data.lastOpened) return;
    const next = new Map();
    for (const [k, v] of Object.entries(data.lastOpened)) next.set(k, v);
    lastOpenedApps.value = next;
  });

  if (typeof api.onMainError === "function") {
    api.onMainError((data) => {
      import("./store.js").then(({ showToast }) => {
        const msg = (data && data.message) || "后台任务出错";
        showToast(`后台异常: ${msg}`, "error", 8000);
      });
    });
  }

  if (typeof api.onDigestOpen === "function") {
    api.onDigestOpen(() => {
      import("./store.js").then(({ digestDrawerOpen }) => {
        digestDrawerOpen.value = true;
      });
    });
  }

  api.onStateRecovered((evt) => {
    import("./store.js").then(({ stateRecoveredSignal }) => {
      if (evt) stateRecoveredSignal.value = evt;
    });
  });

  api.onCheckProgress((result) => {
    if (!result || !result.name) return;
    if (result.status === 'started') {
      markAppDetecting(result.name, result && result._sessionId);
      return;
    }
    applyProgress(result, result && result._sessionId);
  });

  if (typeof api.onCheckFinished === 'function') {
    api.onCheckFinished(async () => {
      if (isCheckRunning()) finishCheck();
      try {
        const { applyCachedResults, results: resultsSig, apps: appsSig } = await import('./store.js');
        if (resultsSig.value.size === 0) {
          const cached = await api.getCachedState();
          if (cached && cached.apps)
            applyCachedResults(cached, appsSig.value);
        }
      } catch { /* noop */ }
    });
  }

  if (typeof api.onCheckDetecting === 'function') {
    api.onCheckDetecting((data) => {
      if (data && data.name) {
        markAppDetecting(data.name, data._sessionId);
      }
    });
  }

  api.onStartCheck(() => triggerCheck());

  import('./tray-focus.js').then(({ subscribeTrayFocus }) => {
    subscribeTrayFocus(api);
  });

  api.onAutoCheckFinished(() => {
    if (!isCheckRunning()) finishCheck();
    import('./store.js').then(({ refreshLastOpened }) => {
      refreshLastOpened().catch(() => {});
    });
  });

  api.onBulkUpgradeProgress(applyBulkUpgradeProgress);
  activeRecheck = createAutoRecheck({ triggerCheck });
  api.onBulkUpgradeDone((summary) => {
    applyBulkUpgradeDone(summary);
    activeRecheck.schedule();
  });

  window.addEventListener('app-row:upgraded', () => triggerCheck());
  import("./error-reporting.js").then((m) => m.installErrorReporting()).catch(() => {});

  window.addEventListener('app:open-config', () => {
    if (typeof window !== 'undefined' && window.api) {
      try { window.api.openConfig && window.api.openConfig(); } catch { /* noop */ }
    }
  });

  if (typeof window !== 'undefined' && window.pulse && window.pulse.tray) {
    const trayApi = window.pulse.tray;
    if (typeof trayApi.onOpenConfig === 'function') {
      trayApi.onOpenConfig(() => {
        import('./trayConfigStore.js').then(({ openTrayConfig }) => openTrayConfig());
      });
    }
    if (typeof trayApi.onCloseConfigModal === 'function') {
      trayApi.onCloseConfigModal(() => {
        import('./trayConfigStore.js').then(({ closeTrayConfig }) => closeTrayConfig());
      });
    }
    import('./trayConfigStore.js').then(({ applyTrayPrefsFromMain }) => {
      Promise.resolve(trayApi.getPrefs && trayApi.getPrefs()).then((r) => {
        if (r && r.ok && r.prefs) applyTrayPrefsFromMain(r.prefs);
      }).catch(() => {});
    });
    import('./worldcup/navStore.js').then(({ installNavWatch }) => installNavWatch());
  }
}

async function bootstrapDeferred(cfg) {
  try {
    const cached = await api.getCachedState();
    if (cached && cached.apps) {
      const { applyCachedResults } = await import('./store.js');
      applyCachedResults(cached, (cfg && cfg.apps) || []);
    }
  } catch { /* noop */ }

  try {
    await Promise.allSettled([
      loadMutes(),
      loadLastOpened(),
      loadActiveCategory(),
    ]);
  } catch { /* noop */ }

  subscribeAiTaskUpdates();
  subscribeAISessionsConfigUpdates();
  Promise.allSettled([
    loadAISessionsConfig(),
    import('./store.js').then((m) => m.probeAIKeyStatuses()),
    import('./recent/recentStore.js').then((m) => {
      m.installRecentListener();
      return m.loadRecent();
    }),
    import('./reminders/remindersStore.js').then((m) => {
      m.installRemindersListener();
    }),
  ]).catch(() => {});
  loadAiTasks().catch(() => {});

  try {
    const payload = await api.releaseNotes.getCurrent();
    if (!payload) return;
    releaseNotesPayload.value = payload;
    if (!payload.alreadySeen) {
      openReleaseNotes('auto', payload);
    }
  } catch { /* noop */ }

  if (cfg.check_on_launch) {
    triggerCheck();
  }
}

function scheduleDeferredBootstrap(cfg) {
  const run = () => bootstrapDeferred(cfg).catch(() => {});
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 0);
  }
}

async function bootstrap() {
  applyPlatformBodyClass();
  initTheme();

  let cfg = { apps: [], check_on_launch: true };
  try {
    cfg = await api.getConfig();
    cfg.apps = cfg.apps || [];
  } catch (err) {
    log.error("getConfig failed:", err);
  }
  apps.value = cfg.apps;
  primeConfigCache(cfg);

  // P-N: HomeGrid 落点 — 拿到上次停留的 nav, 在 render 之前覆盖 activeNav,
  // 避免首帧闪 HomeGrid 再切到目标 (视觉撕裂).
  // 非法值 / 失败 → 静默, 留在默认 activeNav="home".
  if (typeof api.getLastActiveNav === 'function') {
    try {
      const { lastActiveNav } = await api.getLastActiveNav();
      if (lastActiveNav && PERSISTABLE_NAV_KEYS.has(lastActiveNav)) {
        setActiveNav(lastActiveNav);
      }
    } catch (err) {
      log.error("getLastActiveNav failed:", err);
    }
  }

  const mount = document.getElementById('app') || document.body;
  render(
    <ErrorBoundary>
      <App onCheck={triggerCheck} />
    </ErrorBoundary>,
    mount,
  );

  wireRendererListeners();
  // P10: 主题同步给主进程 (tray submenu 选中标记用)
  if (typeof api.themeSet === 'function') {
    api.themeSet(getThemePreference()).catch(() => {});
  }
  // P10: 监听主进程广播 (托盘切换或 nativeTheme 变化)
  if (typeof api.onThemeChanged === 'function') {
    const { showToast } = await import('./store.js');
    const TOAST_LABEL = { system: '跟随系统', light: '浅色', dark: '深色' };
    api.onThemeChanged(({ mode, source }) => {
      if (mode && ['system', 'light', 'dark'].includes(mode)) {
        // 仅当来自托盘 (source='tray') 时 toast — system 模式自动跟随不 toast (避免噪音)
        setThemePreference(mode);
        if (source === 'tray') {
          showToast(`主题已切换为「${TOAST_LABEL[mode] || mode}」`, 'success', 1800);
        }
      }
    });
  }
  scheduleDeferredBootstrap(cfg);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
