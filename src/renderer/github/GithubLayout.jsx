/**
 * src/renderer/github/GithubLayout.jsx
 *
 * GitHub 优秀项目收录 — 顶级 nav panel 容器 (v2.80)。
 * 镜像 AIUsageLayout：mount 时加载已收录项目。
 *
 * v3 后台定时检查：mount 时启动调度器（autoCheck=true 才跑），unmount 时停止。
 * 监听 github-settings-changed 事件，设置变更时 restart 调度器。
 */

import { useEffect } from "preact/hooks";
import "./github.css";
import {
  loadGithubProjects,
  loadGithubSettings,
  githubProjects,
  checkGithubUpdates,
} from "../store/github-projects-store.js";
import { GithubPage } from "./GithubPage.jsx";
import { createGithubCheckScheduler } from "./github-check-scheduler.js";

export function GithubLayout() {
  useEffect(() => {
    loadGithubProjects();
    loadGithubSettings();
    // 首次进入：静默检查一次（仅从未拉过 release 的项目），写入版本字段但不弹 toast
    const t = setTimeout(() => {
      const projs = githubProjects.value;
      if (projs.some((p) => !p.releaseFetchedAt)) {
        checkGithubUpdates({ onlyStale: true }).catch(() => {});
      }
    }, 800);

    // 后台定时检查 + 桌面通知调度器
    const scheduler = createGithubCheckScheduler();
    scheduler.start();

    // 设置变更（autoCheck/interval）时重启调度器
    const onSettingsChanged = () => scheduler.restart();
    globalThis.addEventListener("github-settings-changed", onSettingsChanged);

    return () => {
      clearTimeout(t);
      globalThis.removeEventListener("github-settings-changed", onSettingsChanged);
      scheduler.stop();
    };
  }, []);
  return (
    <div class="github-layout">
      <GithubPage />
    </div>
  );
}

export default GithubLayout;
