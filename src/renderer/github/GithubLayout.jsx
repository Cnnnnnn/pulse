/**
 * src/renderer/github/GithubLayout.jsx
 *
 * GitHub 优秀项目收录 — 顶级 nav panel 容器 (v2.80)。
 * 镜像 AIUsageLayout：mount 时加载已收录项目。
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
    return () => clearTimeout(t);
  }, []);
  return (
    <div class="github-layout">
      <GithubPage />
    </div>
  );
}

export default GithubLayout;
