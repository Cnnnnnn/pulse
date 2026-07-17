/**
 * src/renderer/github/github-check-scheduler.js
 *
 * 后台定时检查 GitHub 项目新版本 + 桌面通知。
 *
 * 架构决策：github 数据全在 renderer localStorage，主进程读不到，故调度器放
 * renderer（应用开着才跑——合理预期）。通知用 HTML5 Notification API
 * （Electron renderer 支持，首次需请求权限）。
 *
 * 设计：
 *   - createGithubCheckScheduler() 工厂
 *   - start()：autoCheck=true 时启 setInterval，首次延迟 60s 避免启动即打扰
 *   - checkOnce()：调 checkGithubUpdates（静默无进度），newCount>0 且 notifyOnNew 时发通知
 *   - stop()/restart()：幂等
 *   - 幂等 start（重复调不启多个 interval）
 */

import {
  checkGithubUpdates,
  githubAutoCheck,
  githubAutoCheckIntervalMin,
  githubNotifyOnNew,
} from "../store/github-projects-store.js";

const INITIAL_DELAY_MS = 60 * 1000; // 首次延迟 60s，避免启动即检查打扰

export function createGithubCheckScheduler() {
  let intervalHandle = null;
  let initialTimer = null;
  let started = false;

  async function checkOnce() {
    try {
      const r = await checkGithubUpdates({});
      if (!r || !r.ok) return;
      if (r.newCount > 0 && githubNotifyOnNew.value) {
        _notifyNewReleases(r.newCount, r.failedProjects || []);
      }
    } catch {
      /* 静默失败不打扰用户 */
    }
  }

  function clear() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    if (initialTimer) {
      clearTimeout(initialTimer);
      initialTimer = null;
    }
  }

  function start() {
    if (started) return; // 幂等
    if (!githubAutoCheck.value) return; // 用户关闭了自动检查
    started = true;
    // 首次延迟 60s
    initialTimer = setTimeout(() => {
      initialTimer = null;
      checkOnce();
      const intervalMs = (githubAutoCheckIntervalMin.value || 360) * 60 * 1000;
      intervalHandle = setInterval(() => {
        checkOnce();
      }, intervalMs);
    }, INITIAL_DELAY_MS);
  }

  function stop() {
    started = false;
    clear();
  }

  function restart() {
    stop();
    start();
  }

  return { start, stop, restart, checkOnce };
}

/**
 * 发系统通知：发现新版本。首次请求权限；权限被拒或不支持则静默回退。
 */
function _notifyNewReleases(newCount, failedProjects) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;
    const send = () => {
      try {
        const n = new Notification("GitHub 项目有新版本", {
          body: `发现 ${newCount} 个项目发布了新版本，点击查看`,
          silent: false,
        });
        n.onclick = () => {
          try {
            window.focus();
          } catch {
            /* noop */
          }
        };
      } catch {
        /* Notification 不可用时静默 */
      }
    };
    if (Notification.permission === "granted") {
      send();
    } else if (Notification.permission === "default") {
      // 首次：请求权限，granted 后才发
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") send();
      });
    }
  } catch {
    /* 整个通知链路失败不打扰 */
  }
}
