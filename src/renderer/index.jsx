/**
 * src/renderer/index.jsx
 *
 * 启动流程 (spec §7):
 *   1. DOMContentLoaded → bootstrap()
 *   2. getConfig() → apps.value = cfg.apps
 *   3. primeConfigCache(cfg)  (给 AppRow 点击打开 download_url 用)
 *   4. render(<App />, #app)   —— **立即 render，不等 check**
 *   5. api.onCheckProgress(applyProgress)
 *   6. api.onStartCheck(() => triggerCheck())
 *   7. window 'app-row:upgraded' → triggerCheck() 重检
 *   8. window 'app:open-config' → api.openUrl(config path)
 *   9. cfg.check_on_launch → triggerCheck()
 *
 * 关键不变量：render 和 triggerCheck 完全解耦，不再 setTimeout 1s。
 * 旧 setTimeout(triggerCheck, 1000) 取消 (spec §6 "启动解耦")。
 *
 * Phase 22: Bulk Upgrade 走 BulkUpgradeButton + BulkUpgradeModal,
 *   旧的 upgradeAll (concurrency=2, brew only) 删掉, 替换为 modal 流.
 */

import { render } from 'preact';
import { App } from './App.jsx';
import { apps, applyProgress, resetCheck, finishCheck, setError, loadMutes, loadLastOpened, loadActiveCategory, loadDailyDigest, subscribeDigestUpdates, lastOpenedApps } from './store.js';
import { api } from './api.js';
import { primeConfigCache } from './components/AppRow.jsx';
import { applyBulkUpgradeProgress, applyBulkUpgradeDone } from './store-bulk-upgrade.js';
import { createAutoRecheck } from './auto-recheck.js';

// Phase A1b: import 触发顶层 setData, 之后 store / selectors 调 category.* 都有数据
import './category-init.js';

async function bootstrap() {
  // 1) 加载 config —— 即便失败也给空壳 UI
  let cfg = { apps: [], check_on_launch: true };
  try {
    cfg = await api.getConfig();
    cfg.apps = cfg.apps || [];
  } catch (err) {
    console.error('getConfig failed:', err);
  }
  apps.value = cfg.apps;
  primeConfigCache(cfg);

  // 1.5) Phase 12: 加载 last-known state 缓存, 网络抽风时 UI 不空白
  //       在 render 之前 apply, 用户进来就能看到上次的版本信息
  try {
    const cached = await api.getCachedState();
    if (cached && cached.apps) {
      const { applyCachedResults } = await import('./store.js');
      applyCachedResults(cached);
    }
  } catch { /* 缓存加载失败不阻塞, 仍走正常 check 路径 */ }

  // 1.6) Phase 27 + 29 + A + B5: 加载 mutes + last-opened + active_category + daily digest
  try {
    await Promise.allSettled([loadMutes(), loadLastOpened(), loadActiveCategory(), loadDailyDigest()]);
  } catch { /* noop, 默认空 map / 'all' / null digest */ }

  // 1.7) Phase B5: 订阅主进程 ai-digest-updated 事件, 重跑 / 24h cron 完成时回写 signal
  subscribeDigestUpdates();

  // 1.7) Phase 29: 订阅主进程 last-opened-updated 事件, 主进程在每次 checkUpdates
  // 完成后会推过来. UI 自动跟最新 (AppInfo / MuteMenu 重渲染)
  api.onLastOpenedUpdated((data) => {
    if (!data || !data.lastOpened) return;
    const next = new Map();
    for (const [k, v] of Object.entries(data.lastOpened)) next.set(k, v);
    lastOpenedApps.value = next;
  });

  // 2) 立即 render
  const mount = document.getElementById('app') || document.body;
  render(<App onCheck={triggerCheck} />, mount);

  // 3) 监听主进程事件
  api.onCheckProgress(applyProgress);
  api.onStartCheck(() => triggerCheck());
  // Phase 16: 后台静默 check 完成时, 进度已经通过 worker postMessage 走 applyProgress 了.
  // 这里再调一次 finishCheck() 把 checkStatus 切到 'done' (后台不发 check-started, 也不会有
  // 任何手动 UI 状态在 'running' — 但 ensure status 不卡 'running' 万一)
  api.onAutoCheckFinished(({ count, ts }) => {
    finishCheck();
    console.log(`[auto-check] ${count} apps refreshed at ${new Date(ts).toLocaleString()}`);
  });

  // Phase 22: Bulk Upgrade 事件订阅 — modal 状态在 store-bulk-upgrade.js
  api.onBulkUpgradeProgress(applyBulkUpgradeProgress);
  // Phase 24: bulk upgrade done → 2s 后自动重检 (修 "升级完还显示有更新" UX bug)
  // 2s 缓冲让 brew cask install / sparkle .zip 解压有时间完成
  // 用户在 2s 内手点 "检查更新" → triggerCheck 会取消 pending recheck, 防双跑
  activeRecheck = createAutoRecheck({ triggerCheck });
  api.onBulkUpgradeDone((summary) => {
    applyBulkUpgradeDone(summary);
    activeRecheck.schedule();
  });

  // 4) AppRow 升级完后希望重检
  window.addEventListener('app-row:upgraded', () => triggerCheck());

  // 5) "打开配置" 按钮
  window.addEventListener('app:open-config', () => {
    // 让主进程走 shell.openPath —— renderer 这边能做的有限
    if (typeof window !== 'undefined' && window.api && window.api.openUrl) {
      // 兜底: 走 main 进程暴露的 openConfig handler (待 Phase 2 加)
      try { window.api.openConfig && window.api.openConfig(); } catch {}
    }
  });

  // 6) 按需触发 check
  if (cfg.check_on_launch) {
    triggerCheck();
  }
}

const AUTO_RECHECK_DELAY_MS = 2000;

// Phase 24: 活跃的 auto-recheck 句柄 (在 bootstrap 里创建并注入 triggerCheck).
// triggerCheck 调 cancel() 防双跑. 不存在时 (例如测试直接调 triggerCheck) 跳过.
let activeRecheck = null;

async function triggerCheck() {
  if (activeRecheck) activeRecheck.cancel();
  resetCheck();
  try {
    await api.checkUpdates();
    finishCheck();
  } catch (err) {
    console.error('checkUpdates failed:', err);
    setError(err && err.message || String(err));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  // 脚本延迟加载时 readyState 已不是 'loading'
  bootstrap();
}
