/**
 * src/renderer/github/GithubProjectList.jsx
 *
 * GitHub 优秀项目收录 — 项目列表（分页）+ 单行。
 */

import { useState } from "preact/hooks";
import {
  IconBook,
  IconSparkles,
  IconTrash,
  IconPackage,
} from "../components/icons.jsx";
import {
  githubProjects,
  githubBusyId,
  removeGithubProject,
  formatStars,
} from "../store/github-projects-store.js";
import { api } from "../api.js";

const PAGE_SIZE = 8;

export function GithubProjectList({ onView, onParse }) {
  const [page, setPage] = useState(1);
  const projects = githubProjects.value;
  const total = projects.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const slice = projects.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (total === 0) {
    return (
      <div class="github-empty">
        <div class="github-empty__icon">
          <IconPackage size={32} />
        </div>
        <p class="github-empty__title">还没有收录任何项目</p>
        <p class="github-empty__hint">
          在上方粘贴 GitHub 项目地址，开始建立你的优秀项目库。
        </p>
      </div>
    );
  }

  return (
    <div class="github-list">
      <ul class="github-list__ul">
        {slice.map((p) => (
          <GithubProjectRow
            key={p.id}
            project={p}
            onView={onView}
            onParse={onParse}
          />
        ))}
      </ul>
      {pageCount > 1 && (
        <div class="github-pager">
          <button
            type="button"
            class="github-pager__btn"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            上一页
          </button>
          <span class="github-pager__info">
            {safePage} / {pageCount}（共 {total} 个）
          </span>
          <button
            type="button"
            class="github-pager__btn"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

function GithubProjectRow({ project, onView, onParse }) {
  const busy = githubBusyId.value === project.id;

  function openExternal() {
    if (project.url) api.openUrl(project.url);
  }

  function handleParse() {
    if (busy) return;
    onParse(project.id);
  }

  return (
    <li class="github-row">
      <div class="github-row__main">
        <button
          type="button"
          class="github-row__name"
          onClick={openExternal}
          title="在 GitHub 打开"
        >
          {project.name}
        </button>
        <p class="github-row__desc">{project.description || "（无简介）"}</p>
        <div class="github-row__meta">
          {project.language && (
            <span class="github-chip">{project.language}</span>
          )}
          {typeof project.stars === "number" && project.stars > 0 && (
            <span class="github-chip github-chip--star">
              ★ {formatStars(project.stars)}
            </span>
          )}
          {project.aiParse && (
            <span class="github-chip github-chip--ok">已解析</span>
          )}
        </div>
      </div>
      <div class="github-row__actions">
        <button
          type="button"
          class="github-btn github-btn--ghost"
          onClick={() => onView(project.id)}
        >
          <IconBook size={14} /> 查看介绍
        </button>
        <button
          type="button"
          class="github-btn github-btn--ghost"
          onClick={handleParse}
          disabled={busy}
        >
          <IconSparkles size={14} /> {project.aiParse ? "查看解析" : "AI 解析"}
        </button>
        <button
          type="button"
          class="github-icon-btn github-icon-btn--danger"
          title="删除"
          onClick={() => removeGithubProject(project.id)}
        >
          <IconTrash size={14} />
        </button>
      </div>
    </li>
  );
}
