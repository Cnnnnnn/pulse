/**
 * src/renderer/github/GithubProjectList.jsx
 *
 * GitHub 优秀项目收录 — 项目列表（搜索 / 排序 + 分页）+ 单行。
 *
 * P0 增强 (2026-07-16):
 *  - 顶部搜索框（按名称 + 简介实时过滤）+ 排序下拉（收录时间 / Star / 名称）
 *  - 行内露出「收录于 MM-DD」与 AI 摘要速览（已解析项目）
 *  - 删除改走全局 ConfirmDialog 二次确认，防误触
 * P1 增强 (2026-07-16):
 *  - 列表 / 卡片视图切换；卡片以网格呈现并露 AI 摘要封面
 *  - 抽出 GithubActions 供行与卡片复用（含窄屏「⋯」溢出菜单）
 *  - 语言筛选胶囊栏（从收录库派生语言集合，仅多语言时显示）
 */

import { useState, useMemo } from "preact/hooks";
import {
  IconBook,
  IconSparkles,
  IconTrash,
  IconPin,
  IconPackage,
  IconMoreHorizontal,
  IconList,
  IconGrid,
} from "../components/icons.jsx";
import {
  githubProjects,
  githubBusyId,
  removeGithubProject,
  togglePinGithubProject,
  formatStars,
  formatAddedDate,
} from "../store/github-projects-store.js";
import { openConfirm } from "../confirmStore.js";
import { api } from "../api.js";

const PAGE_SIZE = 8;

export function GithubProjectList({ onView, onParse }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("added");
  const [view, setView] = useState("list");
  const [lang, setLang] = useState("");

  const projects = githubProjects.value;

  /* 从收录库派生去重、排序的语言集合，用于筛选胶囊 */
  const allLanguages = useMemo(() => {
    const set = new Set();
    projects.forEach((p) => {
      if (p.language) set.add(p.language);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects;
    if (q) {
      list = list.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }
    if (lang) {
      list = list.filter((p) => p.language === lang);
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      // 置顶项始终排在最前（与当前排序无关）
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (sort === "stars") return (b.stars || 0) - (a.stars || 0);
      if (sort === "name") return String(a.name).localeCompare(String(b.name));
      return (b.addedAt || 0) - (a.addedAt || 0);
    });
    return sorted;
  }, [projects, query, lang, sort]);

  const total = visible.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleQuery(e) {
    setQuery(e.currentTarget.value);
    setPage(1);
  }
  function handleSort(e) {
    setSort(e.currentTarget.value);
    setPage(1);
  }
  function handleLang(next) {
    setLang(next);
    setPage(1);
  }
  async function handleRemove(project) {
    const ok = await openConfirm({
      title: "取消收录该项目？",
      message: `将从你的 GitHub 收录库中移除「${project.name}」，此操作不可撤销。`,
      confirmText: "移除",
      cancelText: "取消",
    });
    if (ok) removeGithubProject(project.id);
  }
  function handleTogglePin(project) {
    togglePinGithubProject(project.id);
  }

  if (projects.length === 0) {
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
      <div class="github-toolbar">
        <div class="github-search">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            type="text"
            class="github-search__input"
            placeholder="搜索名称或简介…"
            value={query}
            onInput={handleQuery}
            aria-label="搜索收录项目"
          />
        </div>
        <div class="github-select">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <select
            class="github-select__el"
            value={sort}
            onChange={handleSort}
            aria-label="排序方式"
          >
            <option value="added">排序：收录时间</option>
            <option value="stars">排序：Star 数</option>
            <option value="name">排序：名称</option>
          </select>
        </div>
        <div class="github-view-toggle" role="group" aria-label="视图模式">
          <button
            type="button"
            class={`github-view-toggle__btn ${view === "list" ? "is-active" : ""}`}
            aria-pressed={view === "list"}
            title="列表视图"
            onClick={() => setView("list")}
          >
            <IconList size={16} />
          </button>
          <button
            type="button"
            class={`github-view-toggle__btn ${view === "card" ? "is-active" : ""}`}
            aria-pressed={view === "card"}
            title="卡片视图"
            onClick={() => setView("card")}
          >
            <IconGrid size={16} />
          </button>
        </div>
      </div>

      {allLanguages.length >= 2 && (
        <div class="github-filterbar" role="group" aria-label="按语言筛选">
          <button
            type="button"
            class={`github-chip-pill ${lang === "" ? "is-active" : ""}`}
            aria-pressed={lang === ""}
            onClick={() => handleLang("")}
          >
            全部
          </button>
          {allLanguages.map((l) => (
            <button
              type="button"
              key={l}
              class={`github-chip-pill ${lang === l ? "is-active" : ""}`}
              aria-pressed={lang === l}
              onClick={() => handleLang(l)}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {total === 0 ? (
        <div class="github-empty">
          <p class="github-empty__title">没有匹配的项目</p>
          <p class="github-empty__hint">试试调整搜索关键词。</p>
        </div>
      ) : view === "card" ? (
        <div class="github-cards">
          {slice.map((p) => (
            <GithubProjectCard
              key={p.id}
              project={p}
              onView={onView}
              onParse={onParse}
              onRemove={handleRemove}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      ) : (
        <ul class="github-list__ul">
          {slice.map((p) => (
            <GithubProjectRow
              key={p.id}
              project={p}
              onView={onView}
              onParse={onParse}
              onRemove={handleRemove}
              onTogglePin={handleTogglePin}
            />
          ))}
        </ul>
      )}

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

function GithubProjectRow({ project, onView, onParse, onRemove, onTogglePin }) {
  const added = formatAddedDate(project.addedAt);
  const summary = project.aiParse && project.aiParse.summary;

  function openExternal() {
    if (project.url) api.openUrl(project.url);
  }

  return (
    <li class={`github-row ${project.pinned ? "is-pinned" : ""}`}>
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
          {project.pinned && (
            <span class="github-chip github-chip--pin">已置顶</span>
          )}
          {project.language && (
            <span class="github-chip">{project.language}</span>
          )}
          {typeof project.stars === "number" && project.stars > 0 && (
            <span class="github-chip github-chip--star">
              ★ {formatStars(project.stars)}
            </span>
          )}
          {added && <span class="github-chip">收录于 {added}</span>}
          {project.aiParse && (
            <span class="github-chip github-chip--ok">已解析</span>
          )}
        </div>
        {summary && (
          <div class="github-row__ai">
            <IconSparkles size={16} />
            <span class="github-row__ai-text">
              <b>AI 摘要 ·</b> {summary}
            </span>
          </div>
        )}
      </div>
      <GithubActions
        project={project}
        onView={onView}
        onParse={onParse}
        onRemove={onRemove}
        onTogglePin={onTogglePin}
      />
    </li>
  );
}

/* 行 / 卡片共用的操作区：桌面内联按钮 + 窄屏「⋯」溢出菜单 */
function GithubActions({ project, onView, onParse, onRemove, onTogglePin }) {
  const busy = githubBusyId.value === project.id;
  const pinned = !!project.pinned;
  const [menuOpen, setMenuOpen] = useState(false);

  function handleParse() {
    if (busy) return;
    onParse(project.id);
  }
  function closeMenu() {
    setMenuOpen(false);
  }
  function handlePin() {
    if (onTogglePin) onTogglePin(project);
  }
  function handleViewMenu() {
    closeMenu();
    onView(project.id);
  }
  function handleParseMenu() {
    closeMenu();
    handleParse();
  }
  function handlePinMenu() {
    closeMenu();
    handlePin();
  }
  function handleRemoveMenu() {
    closeMenu();
    if (onRemove) onRemove(project);
  }

  return (
    <>
      <div class="github-row__actions">
        <button
          type="button"
          class={`github-icon-btn github-icon-btn--pin ${pinned ? "is-active" : ""}`}
          title={pinned ? "取消置顶" : "置顶"}
          aria-pressed={pinned}
          onClick={handlePin}
        >
          <IconPin size={14} />
        </button>
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
          onClick={() => onRemove && onRemove(project)}
        >
          <IconTrash size={14} />
        </button>
      </div>
      <div class="github-row__more-wrap">
        <button
          type="button"
          class="github-icon-btn github-row__more"
          aria-label="更多操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <IconMoreHorizontal size={18} />
        </button>
        {menuOpen && (
          <>
            <div
              class="github-row__menu-backdrop"
              onClick={closeMenu}
              aria-hidden="true"
            />
            <div class="github-row__menu" role="menu">
              <button
                type="button"
                class="github-row__menu-item"
                role="menuitem"
                aria-pressed={pinned}
                onClick={handlePinMenu}
              >
                <IconPin size={15} /> {pinned ? "取消置顶" : "置顶"}
              </button>
              <button
                type="button"
                class="github-row__menu-item"
                role="menuitem"
                onClick={handleViewMenu}
              >
                <IconBook size={15} /> 查看介绍
              </button>
              <button
                type="button"
                class="github-row__menu-item"
                role="menuitem"
                onClick={handleParseMenu}
                disabled={busy}
              >
                <IconSparkles size={15} />
                {project.aiParse ? "查看解析" : "AI 解析"}
              </button>
              <button
                type="button"
                class="github-row__menu-item is-danger"
                role="menuitem"
                onClick={handleRemoveMenu}
              >
                <IconTrash size={15} /> 删除
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function GithubProjectCard({ project, onView, onParse, onRemove, onTogglePin }) {
  const added = formatAddedDate(project.addedAt);
  const summary = project.aiParse && project.aiParse.summary;

  function openExternal() {
    if (project.url) api.openUrl(project.url);
  }

  return (
    <div class={`github-card ${project.pinned ? "is-pinned" : ""}`}>
      <div class="github-card__main">
        <button
          type="button"
          class="github-card__name"
          onClick={openExternal}
          title="在 GitHub 打开"
        >
          {project.name}
        </button>
        <p class="github-card__desc">{project.description || "（无简介）"}</p>
        <div class="github-card__meta">
          {project.pinned && (
            <span class="github-chip github-chip--pin">已置顶</span>
          )}
          {project.language && (
            <span class="github-chip">{project.language}</span>
          )}
          {typeof project.stars === "number" && project.stars > 0 && (
            <span class="github-chip github-chip--star">
              ★ {formatStars(project.stars)}
            </span>
          )}
          {added && <span class="github-chip">收录于 {added}</span>}
          {project.aiParse && (
            <span class="github-chip github-chip--ok">已解析</span>
          )}
        </div>
        {summary && (
          <div class="github-card__ai">
            <IconSparkles size={16} />
            <span class="github-card__ai-text">
              <b>AI 摘要 ·</b> {summary}
            </span>
          </div>
        )}
      </div>
      <GithubActions
        project={project}
        onView={onView}
        onParse={onParse}
        onRemove={onRemove}
        onTogglePin={onTogglePin}
      />
    </div>
  );
}
