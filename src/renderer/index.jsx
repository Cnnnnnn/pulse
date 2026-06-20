/**
 * src/renderer/index.jsx
 *
 * 启动流程 (v2 — Session-based):
 *   1. DOMContentLoaded → bootstrap()
 *   2. getConfig() → apps.value = cfg.apps
 *   3. primeConfigCache(cfg)
 *   4. 加载 cached state → applyCachedResults (用户立即看到上次结果)
 *   5. 加载 mutes / last-opened / active category / digest (并行)
 *   6. 订阅主进程事件
 *   7. render(<App />, #app) — 立即渲染，不等 check
 *   8. cfg.check_on_launch → triggerCheck()
 *
 * v2 改进:
 *   - 并发守卫: checkSession.phase === 'running' 时跳过重复触发
 *   - Session ID: 每次 check 生成唯一 ID, progress 事件带 ID 校验
 *   - detecting 状态: 主进程推 'check-detecting' 事件时, app 进入 spinner 态
 *   - auto-check 完成后自动刷新 last-opened 数据
 */

import { render } from 'preact';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
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

const log = taggedLog("[index]");

// Phase A1b: import 触发顶层 setData, 之后 store / selectors 调 category.* 都有数据
import './category-init.js';

// ─── 触发检查 ──────────────────────────────────────────────

/**
 * 触发一轮完整的更新检查。
 *
 * v2 改进:
 *   - 并发守卫: 如果已有 check 在跑, 直接返回 (不中断、不双跑)
 *   - Session ID: startCheck() 返回唯一 sessionId, 传给 applyProgress 做校验
 *   - 检测中的 app 先进入 'detecting' 态 (spinner), 结果到后切 'done'/'error'
 */
async function triggerCheck() {
  if (isCheckRunning()) {
    return;
  }
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

// ─── Bootstrap ──────────────────────────────────────────────

async function bootstrap() {
  // 0) P4: 尽早给 body 加 platform class (Win10 fallback 背景需要在
  //    App 首次 paint 前生效, 否则会有一次白闪).
  applyPlatformBodyClass();

  // 1) 加载 config —— 即便失败也给空壳 UI
  let cfg = { apps: [], check_on_launch: true };
  try {
    cfg = await api.getConfig();
    cfg.apps = cfg.apps || [];
  } catch (err) {
    log.error("getConfig failed:", err);
  }
  apps.value = cfg.apps;
  primeConfigCache(cfg);

  // 2) 加载 last-known state 缓存, 网络抽风时 UI 不空白
  try {
    const cached = await api.getCachedState();
    if (cached && cached.apps) {
      const { applyCachedResults } = await import('./store.js');
      applyCachedResults(cached);
    }
  } catch { /* 缓存加载失败不阻塞 */ }

  // 3) 并行加载 mutes + last-opened + active_category
  try {
    await Promise.allSettled([
      loadMutes(),
      loadLastOpened(),
      loadActiveCategory(),
    ]);
  } catch { /* noop */ }

  // 4) 订阅主进程事件 + 拉今日任务列表 (不调 LLM, 给 Header badge 用)
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

  // last-opened 实时更新
  api.onLastOpenedUpdated((data) => {
    if (!data || !data.lastOpened) return;
    const next = new Map();
    for (const [k, v] of Object.entries(data.lastOpened)) next.set(k, v);
    lastOpenedApps.value = next;
  });

  // 主进程未捕获错误兜底 → 提示用户 (v2.12)
  if (typeof api.onMainError === "function") {
    api.onMainError((data) => {
      import("./store.js").then(({ showToast }) => {
        const msg = (data && data.message) || "后台任务出错";
        showToast(`后台异常: ${msg}`, "error", 8000);
      });
    });
  }

  // Phase I5: open digest drawer on notification click
  if (typeof api.onDigestOpen === "function") {
    api.onDigestOpen(() => {
      import("./store.js").then(({ digestDrawerOpen }) => {
        digestDrawerOpen.value = true;
      });
    });
  }

  // Phase Q8: state.json corruption self-recovery banner
  api.onStateRecovered((evt) => {
    import("./store.js").then(({ stateRecoveredSignal }) => {
      if (evt) stateRecoveredSignal.value = evt;
    });
  });

  // 5) 立即 render
  const mount = document.getElementById('app') || document.body;
  render(
    <ErrorBoundary>
      <App onCheck={triggerCheck} />
    </ErrorBoundary>,
    mount,
  );

  // 6) 监听检测进度事件
  //    applyProgress 已内置 sessionId 校验, 过期事件会被丢弃
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
        const { applyCachedResults, results: resultsSig } = await import('./store.js');
        if (resultsSig.value.size === 0) {
          const cached = await api.getCachedState();
          if (cached && cached.apps) applyCachedResults(cached);
        }
      } catch { /* noop */ }
    });
  }

  // detecting 事件: app 开始检测, UI 显示 spinner (可选, 主进程推了就用)
  if (typeof api.onCheckDetecting === 'function') {
    api.onCheckDetecting((data) => {
      if (data && data.name) {
        markAppDetecting(data.name, data._sessionId);
      }
    });
  }

  api.onStartCheck(() => triggerCheck());

  // v2.22 Task A3: 订阅菜单栏点击 → 切 tab + 滚 + 弹 modal
  import('./tray-focus.js').then(({ subscribeTrayFocus }) => {
    subscribeTrayFocus(api);
  });

  // 后台自动 check 完成时: finish session + 刷新 last-opened
  api.onAutoCheckFinished(() => {
    // 如果当前没有手动 check 在跑, 直接标记 done
    if (!isCheckRunning()) {
      finishCheck();
    }
    // 刷新 last-opened 数据
    import('./store.js').then(({ refreshLastOpened }) => {
      refreshLastOpened().catch(() => {});
    });
  });

  // Bulk Upgrade 事件
  api.onBulkUpgradeProgress(applyBulkUpgradeProgress);
  activeRecheck = createAutoRecheck({ triggerCheck });
  api.onBulkUpgradeDone((summary) => {
    applyBulkUpgradeDone(summary);
    activeRecheck.schedule();
  });

  // AppRow 升级完后重检
  window.addEventListener('app-row:upgraded', () => triggerCheck());

  // Phase Q6: install global error listeners
  import("./error-reporting.js").then((m) => m.installErrorReporting()).catch(() => {});

  // "打开配置" 按钮
  window.addEventListener('app:open-config', () => {
    if (typeof window !== 'undefined' && window.api) {
      try { window.api.openConfig && window.api.openConfig(); } catch { /* noop */ }
    }
  });

  // 按需触发 check
  if (cfg.check_on_launch) {
    triggerCheck();
  }
}

// ─── Auto-recheck handle ──────────────────────────────────
let activeRecheck = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
