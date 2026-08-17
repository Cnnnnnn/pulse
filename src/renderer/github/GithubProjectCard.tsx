import {
  IconExternalLink,
  IconGithub,
  IconMoreHorizontal,
  IconPin,
  IconSparkles,
  IconTrash,
} from "../components/icons.tsx";
import {
  formatAddedDate,
  formatStars,
  hasDistinctHomepage,
  hostnameOf,
  hasGithubUpdate,
} from "../store/github-projects-store.ts";
import { collectGithubTags } from "./github-library-selectors.ts";
import { api } from "../api.ts";
import { useState } from "preact/hooks";

const LANGUAGE_DOT_COLORS: Record<string, string> = {
  JavaScript: "var(--accent-orange)",
  TypeScript: "var(--accent-blue)",
  Python: "var(--app-codex)",
  Go: "var(--accent-amber)",
  Rust: "var(--accent-orange)",
  Vue: "var(--accent-green)",
  C: "var(--accent-gray)",
};

function langDotColor(language: string) {
  return LANGUAGE_DOT_COLORS[language] || "var(--accent-gray)";
}

function GithubUpdateBadge({ project, onView }: any) {
  if (!project.latestVersion) return null;
  if (hasGithubUpdate(project)) {
    return (
      <button
        type="button"
        class="github-chip github-chip--update"
        onClick={() => onView?.(project.id, "update")}
        title="查看更新"
      >
        <span class="github-chip--update-dot" aria-hidden="true" />
        新版本 v{project.latestVersion}
      </button>
    );
  }
  return <span class="github-chip github-chip--version">v{project.latestVersion}</span>;
}

function GithubCardActions({ project, onView, onParse, onRemove, onTogglePin }: any) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const busy = false;

  return (
    <div class="github-card__actions">
      <button
        type="button"
        class="github-icon-btn"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <IconMoreHorizontal size={18} />
      </button>
      {menuOpen && (
        <>
          <div class="github-card__menu-backdrop" onClick={closeMenu} aria-hidden="true" />
          <div class="github-card__menu" role="menu">
            <button type="button" class="github-row__menu-item" role="menuitem" onClick={() => { closeMenu(); onView?.(project.id); }}>
              <IconGithub size={15} /> 查看介绍
            </button>
            <button type="button" class="github-row__menu-item" role="menuitem" onClick={() => { closeMenu(); onParse?.(project.id); }} disabled={busy}>
              <IconSparkles size={15} /> {project.aiParse ? "查看解析" : "AI 解析"}
            </button>
            <button type="button" class="github-row__menu-item" role="menuitem" aria-pressed={!!project.pinned} onClick={() => { closeMenu(); onTogglePin?.(project); }}>
              <IconPin size={15} /> {project.pinned ? "取消置顶" : "置顶"}
            </button>
            <button type="button" class="github-row__menu-item is-danger" role="menuitem" onClick={() => { closeMenu(); onRemove?.(project); }}>
              <IconTrash size={15} /> 删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function GithubProjectCard({ project, onView, onParse, onRemove, onTogglePin }: any) {
  const tags = collectGithubTags([project]);
  const visibleTags = tags.slice(0, 3);
  const overflowCount = Math.max(0, tags.length - visibleTags.length);
  const summary = project.aiParse?.summary;

  return (
    <article class={`github-card ${project.pinned ? "is-pinned" : ""}`}>
      <div class="github-card__main">
        <div class="github-card__head">
          <span class="github-repo-icon"><IconGithub size={18} /></span>
          <div class="github-card__headtext">
            <button
              type="button"
              class="github-card__name"
              onClick={() => onView?.(project.id)}
              title="打开项目面板"
            >
              {project.name}
            </button>
            <p class="github-card__desc">{project.description || "（无简介）"}</p>
          </div>
          <GithubCardActions
            project={project}
            onView={onView}
            onParse={onParse}
            onRemove={onRemove}
            onTogglePin={onTogglePin}
          />
        </div>

        <div class="github-card__meta">
          {project.pinned && <span class="github-chip github-chip--pin">已置顶</span>}
          {project.language && (
            <span class="github-chip">
              <span class="github-lang-dot" style={{ background: langDotColor(project.language) }} aria-hidden="true" />
              {project.language}
            </span>
          )}
          {typeof project.stars === "number" && project.stars > 0 && (
            <span class="github-chip github-chip--star">★ {formatStars(project.stars)}</span>
          )}
          {project.license && <span class="github-chip github-chip--license">{project.license}</span>}
          {hasDistinctHomepage(project) && (
            <a
              class="github-chip github-chip--link"
              href={project.homepage}
              title={project.homepage}
              onClick={(event) => { event.preventDefault(); api.openUrl(project.homepage); }}
            >
              <IconExternalLink size={12} /> {hostnameOf(project.homepage)}
            </a>
          )}
          {formatAddedDate(project.addedAt) && <span class="github-chip">收录于 {formatAddedDate(project.addedAt)}</span>}
          {visibleTags.map((tag) => <span class="github-chip" key={tag}>{tag}</span>)}
          {overflowCount > 0 && <span class="github-chip">+{overflowCount}</span>}
          {project.aiParse ? <span class="github-chip github-chip--ok">已解析</span> : <span class="github-chip github-chip--parsable">待解析</span>}
          <GithubUpdateBadge project={project} onView={onView} />
        </div>

        {summary && (
          <div class="github-card__ai">
            <IconSparkles size={16} />
            <span class="github-card__ai-text"><b>AI 摘要 ·</b> {summary}</span>
          </div>
        )}
      </div>
    </article>
  );
}

export default GithubProjectCard;
