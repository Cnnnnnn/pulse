/**
 * src/renderer/github/GithubLayout.jsx
 *
 * GitHub 优秀项目收录 — 顶级 nav panel 容器 (v2.80)。
 * 镜像 AIUsageLayout：mount 时加载已收录项目。
 */

import { useEffect } from "preact/hooks";
import "./github.css";
import { loadGithubProjects } from "../store/github-projects-store.js";
import { GithubPage } from "./GithubPage.jsx";

export function GithubLayout() {
  useEffect(() => {
    loadGithubProjects();
  }, []);
  return (
    <div class="github-layout">
      <GithubPage />
    </div>
  );
}

export default GithubLayout;
