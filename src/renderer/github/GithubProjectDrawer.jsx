/**
 * src/renderer/github/GithubProjectDrawer.jsx
 *
 * GitHub 优秀项目收录 — 详情抽屉：内部 README / AI 解析 双 tab。
 */

import { useState, useEffect } from "preact/hooks";
import { DrawerShell } from "../components/DrawerShell.jsx";
import {
  IconGlobe,
  IconRefresh,
  IconSparkles,
  IconBook,
} from "../components/icons.jsx";
import {
  githubProjects,
  githubBusyId,
  parseGithubProjectAi,
  refreshGithubReadme,
  formatStars,
} from "../store/github-projects-store.js";
import { api } from "../api.js";
import { GithubReadmeView } from "./GithubReadmeView.jsx";
import { GithubAiParseView } from "./GithubAiParseView.jsx";

export function GithubProjectDrawer({ projectId, initialTab = "readme", onClose }) {
  const [tab, setTab] = useState(initialTab === "ai" ? "ai" : "readme");
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState(null);

  const project = githubProjects.value.find((p) => p.id === projectId) || null;

  // 进入 AI tab 且尚无解析结果时，自动触发 AI 解析
  useEffect(() => {
    if (tab !== "ai" || !project) return undefined;
    if (project.aiParse) return undefined;
    let cancelled = false;
    setParseLoading(true);
    setParseError(null);
    parseGithubProjectAi(project.id)
      .then((r) => {
        if (!cancelled && !r.ok) setParseError(r.reason);
      })
      .finally(() => {
        if (!cancelled) setParseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, project && project.id, project && project.aiParse]);

  if (!project) return null;

  const busy = githubBusyId.value === project.id;

  function openExternal() {
    if (project.url) api.openUrl(project.url);
  }

  async function handleRefresh() {
    await refreshGithubReadme(project.id);
  }

  function handleRetryParse() {
    setParseError(null);
    setParseLoading(true);
    parseGithubProjectAi(project.id, true)
      .then((r) => {
        if (!r.ok) setParseError(r.reason);
      })
      .finally(() => setParseLoading(false));
  }

  const header = (
    <header class="github-drawer__header">
      <div class="github-drawer__title-wrap">
        <span class="github-drawer__title">{project.name}</span>
        {project.language && (
          <span class="github-drawer__lang">{project.language}</span>
        )}
        {typeof project.stars === "number" && project.stars > 0 && (
          <span class="github-drawer__stars">
            ★ {formatStars(project.stars)}
          </span>
        )}
      </div>
      <div class="github-drawer__actions">
        <button
          type="button"
          class="github-icon-btn"
          title="刷新 README"
          onClick={handleRefresh}
          disabled={busy}
        >
          <IconRefresh size={16} />
        </button>
        <button
          type="button"
          class="github-icon-btn"
          title="在 GitHub 打开"
          onClick={openExternal}
        >
          <IconGlobe size={16} />
        </button>
        <button
          type="button"
          class="github-drawer__close"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    </header>
  );

  const tabs = (
    <div class="github-drawer__tabs">
      <button
        type="button"
        class={`github-tab${tab === "readme" ? " is-active" : ""}`}
        onClick={() => setTab("readme")}
      >
        <IconBook size={14} /> README
      </button>
      <button
        type="button"
        class={`github-tab${tab === "ai" ? " is-active" : ""}`}
        onClick={() => setTab("ai")}
      >
        <IconSparkles size={14} /> AI 解析
      </button>
    </div>
  );

  return (
    <DrawerShell
      open
      onClose={onClose}
      header={header}
      overlayClass="github-drawer-overlay"
      drawerClass="github-drawer"
      bodyClass="github-drawer__body"
    >
      {tabs}
      <div class="github-drawer__content">
        {tab === "readme" ? (
          <GithubReadmeView markdown={project.readme} loading={busy} />
        ) : (
          <GithubAiParseView
            result={project.aiParse}
            loading={parseLoading || (busy && !project.aiParse)}
            error={parseError}
            onRetry={handleRetryParse}
          />
        )}
      </div>
    </DrawerShell>
  );
}

export default GithubProjectDrawer;
