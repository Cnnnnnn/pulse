import { useEffect, useState } from "preact/hooks";
import { IconBook, IconSparkles, IconTag } from "../components/icons.tsx";
import {
  githubBusyId,
  githubProjects,
  markGithubProjectViewed,
  parseGithubProjectAi,
  refreshGithubReadme,
  formatStars,
} from "../store/github-projects-store.ts";
import { api } from "../api.ts";
import { GithubAiParseView } from "./GithubAiParseView.tsx";
import { GithubDrawerShell, type GithubDrawerTab } from "./GithubDrawerShell.tsx";
import { GithubReadmeView } from "./GithubReadmeView.tsx";
import { GithubReleasesView } from "./GithubReleasesView.tsx";

type GithubPanelTab = "overview" | "readme" | "ai" | "update";

function normalizeTab(tab: string): GithubPanelTab {
  if (tab === "readme" || tab === "ai" || tab === "update") return tab;
  return "overview";
}

function GithubProjectOverview({ project }: { project: any }) {
  const tags = [
    ...(Array.isArray(project.topics) ? project.topics : []),
    ...(Array.isArray(project.aiParse?.tags) ? project.aiParse.tags : []),
  ].filter(Boolean).filter((tag, index, list) => list.indexOf(tag) === index);

  return (
    <div class="github-overview">
      <section class="github-overview__hero">
        <p class="github-library__eyebrow">项目概览</p>
        <h2>{project.name}</h2>
        <p>{project.description || "该项目暂未提供简介。"}</p>
      </section>
      <div class="github-overview__stats">
        {project.language && <div><span>主要语言</span><strong>{project.language}</strong></div>}
        {typeof project.stars === "number" && <div><span>Star</span><strong>★ {formatStars(project.stars)}</strong></div>}
        {project.latestVersion && <div><span>最新版本</span><strong>v{project.latestVersion}</strong></div>}
      </div>
      {project.aiParse?.summary && (
        <section class="github-overview__section github-overview__summary">
          <div class="github-overview__section-title"><IconSparkles size={15} /> AI 一句话定位</div>
          <p>{project.aiParse.summary}</p>
        </section>
      )}
      {tags.length > 0 && (
        <section class="github-overview__section">
          <div class="github-overview__section-title"><IconTag size={15} /> 关键词</div>
          <div class="github-ai-tags">
            {tags.map((tag) => <span class="github-ai-tag" key={tag}>{tag}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}

export function GithubProjectPanel({ projectId, initialTab = "overview", onClose }: any) {
  const [tab, setTab] = useState<GithubPanelTab>(normalizeTab(initialTab));
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const project = githubProjects.value.find((item: any) => item.id === projectId) || null;

  useEffect(() => {
    if (project) markGithubProjectViewed(project.id);
  }, [projectId]);

  useEffect(() => {
    if (tab !== "ai" || !project || project.aiParse) return undefined;
    let cancelled = false;
    setParseLoading(true);
    setParseError(null);
    parseGithubProjectAi(project.id)
      .then((result: any) => {
        if (!cancelled && !result.ok) setParseError(result.reason || "parse_failed");
      })
      .finally(() => {
        if (!cancelled) setParseLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, project?.id, project?.aiParse]);

  if (!project) return null;
  const busy = githubBusyId.value === project.id;

  const tabs: GithubDrawerTab[] = [
    { key: "overview", label: "概览", icon: IconSparkles },
    { key: "readme", label: "README", icon: IconBook },
    { key: "ai", label: "AI 解析", icon: IconSparkles },
    { key: "update", label: "版本更新", icon: IconTag },
  ];

  function openExternal() {
    if (project.url) api.openUrl(project.url);
  }

  function handleRefresh() {
    return refreshGithubReadme(project.id);
  }

  function handleRetryParse() {
    setParseError(null);
    setParseLoading(true);
    parseGithubProjectAi(project.id, true)
      .then((result: any) => { if (!result.ok) setParseError(result.reason || "parse_failed"); })
      .finally(() => setParseLoading(false));
  }

  return (
    <GithubDrawerShell
      project={project}
      tabs={tabs}
      activeTab={tab}
      onTabChange={(next) => setTab(normalizeTab(next))}
      onRefresh={handleRefresh}
      onOpenExternal={openExternal}
      onClose={onClose}
      busy={busy}
    >
      <div class={`github-panel-content github-panel-content--${tab}`}>
        {tab === "overview" ? (
          <GithubProjectOverview project={project} />
        ) : tab === "readme" ? (
          <GithubReadmeView markdown={project.readme} loading={busy} />
        ) : tab === "ai" ? (
          <GithubAiParseView
            result={project.aiParse}
            loading={parseLoading || (busy && !project.aiParse)}
            error={parseError}
            onRetry={handleRetryParse}
          />
        ) : (
          <GithubReleasesView project={project} />
        )}
      </div>
    </GithubDrawerShell>
  );
}

export default GithubProjectPanel;
